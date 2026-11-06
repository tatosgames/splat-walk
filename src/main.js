import * as pc from 'playcanvas';
import { FilmPass } from './post.js';
import { Walk, plyToWorld, wallsAt } from './walk.js';
import { ROUTE } from './route.js';
import { Soundtrack } from './audio.js';
import { BurnFx } from './burn.js';
import { settings, numeric, outputRatio, viewTanHalf } from './settings.js';
import { CameraLook } from './camera-look.js';

const params = new URLSearchParams(location.search);
const config = settings(params);
// Only benchmark.html installs this observer; the demo loads no benchmark module.
const probe = globalThis.__splatProbe;
probe?.mark('main');
const DEBUG = params.has('debug');
if (DEBUG) document.body.classList.add('debug');

// ---- the camera: a phone-like lens, with an explicit pixel and frame budget ----
const DISPLAY_VFOV = config.fov;
const OVERSCAN = 1.1;                                  // spare image around the frame for shake, blur and lens
let FPS = config.fps;
const SHUTTER = config.shutter;
const READOUT = config.readout;
const SCENE_URL = config.scene;

const canvas = document.getElementById('canvas');
const stage = document.getElementById('stage');
const overlay = document.getElementById('overlay');
const hud = document.getElementById('hud');
const hint = document.getElementById('hint');
const pauseBtn = document.getElementById('pausebtn');
const bar = overlay.querySelector('.bar');
const status = overlay.querySelector('.status');

probe?.mark('deviceStart');
const device = await pc.createGraphicsDevice(canvas, {
    deviceTypes: params.has('webgl') ? [pc.DEVICETYPE_WEBGL2] : [pc.DEVICETYPE_WEBGPU, pc.DEVICETYPE_WEBGL2],
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance'
}).catch(err => {
    status.textContent = 'This browser could not start the 3D renderer. Try an updated browser.';
    const retry = document.getElementById('retry');
    retry.hidden = false; retry.onclick = () => location.reload();
    probe?.fail(String(err));
    throw err;
});
probe?.mark('deviceReady');

const opts = new pc.AppOptions();
opts.graphicsDevice = device;
opts.componentSystems = [pc.CameraComponentSystem, pc.GSplatComponentSystem];
opts.resourceHandlers = [pc.GSplatHandler, pc.TextureHandler, pc.JsonHandler];
if (DEBUG) {
    opts.keyboard = new pc.Keyboard(window);
    opts.mouse = new pc.Mouse(canvas);
}
const app = new pc.AppBase(canvas);
app.init(opts);
app.setCanvasFillMode(pc.FILLMODE_NONE);
app.setCanvasResolution(pc.RESOLUTION_AUTO);
app.autoRender = false;   // frames are rendered on the video's own clock

let laidOut = '';
let aspect = 16 / 9;
const originalTan = Math.tan(DISPLAY_VFOV * Math.PI / 360);
let tanHalfDisplay = originalTan;
let viewCamera;
function layout() {
    const ww = window.innerWidth, wh = window.innerHeight;
    laidOut = `${ww}x${wh}x${window.devicePixelRatio}`;
    const immersive = wh > ww || matchMedia('(pointer: coarse)').matches;
    let w = ww, h = immersive ? wh : Math.round(ww * 9 / 16);
    if (!immersive && h > wh) { h = wh; w = Math.round(wh * 16 / 9); }
    aspect = w / h;
    tanHalfDisplay = viewTanHalf(DISPLAY_VFOV, aspect);
    if (viewCamera) viewCamera.camera.fov = 2 * Math.atan(tanHalfDisplay * OVERSCAN) * 180 / Math.PI;
    stage.style.width = `${w}px`;
    stage.style.height = `${h}px`;
    const dpr = window.devicePixelRatio || 1;
    device.maxPixelRatio = Math.max(0.1, outputRatio(w, h, dpr, config));
    app.resizeCanvas(w, h);
    app.renderNextFrame = true;
}
window.addEventListener('resize', layout);
layout();
app.start();

// ---- splat settings: smooth, pop-free view-dependent colour, everything at full detail ----
const gs = app.scene.gsplat;
if (params.get('sort') === 'cpu') gs.renderer = pc.GSPLAT_RENDERER_RASTER_CPU_SORT;
gs.alphaClipForward = numeric(params, 'alpha', config.profile === 'performance' ? 0.02 : 1 / 255, 1 / 255, 0.1);
gs.radialSorting = true;          // turning the head doesn't re-order splats
gs.colorUpdateAngle = numeric(params, 'cua', 0.6, 0.01, 15);
gs.splatBudget = 0;               // no LOD budget: the whole passage at its finest level
gs.lodUnderfillLimit = 0;

// ---- scene camera renders the splats into an HDR target, the film pass makes it footage ----
const camera = new pc.Entity('camera');
camera.addComponent('camera', {
    clearColor: new pc.Color(0.84, 0.855, 0.875),
    fov: 2 * Math.atan(tanHalfDisplay * OVERSCAN) * 180 / Math.PI,
    nearClip: 0.2,
    farClip: 500,
    gammaCorrection: pc.GAMMA_SRGB,
    toneMapping: pc.TONEMAP_LINEAR
});
viewCamera = camera;
app.root.addChild(camera);

const hdr = device.textureHalfFloatRenderable ? pc.PIXELFORMAT_RGBA16F : pc.PIXELFORMAT_RGBA8;
const sceneTexture = new pc.Texture(device, {
    name: 'scene',
    width: 4,
    height: 4,
    format: hdr,
    mipmaps: true,
    minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
    magFilter: pc.FILTER_LINEAR,
    addressU: pc.ADDRESS_CLAMP_TO_EDGE,
    addressV: pc.ADDRESS_CLAMP_TO_EDGE
});
const sceneTarget = new pc.RenderTarget({ colorBuffer: sceneTexture, depth: true });
camera.camera.renderTarget = sceneTarget;

// a second camera owns no geometry: it only runs the film pass into the canvas
const filmLayer = new pc.Layer({ name: 'Film' });
app.scene.layers.push(filmLayer);
const filmCam = new pc.Entity('film');
filmCam.addComponent('camera', { priority: 1, layers: [filmLayer.id], clearColorBuffer: false, clearDepthBuffer: false });
app.root.addChild(filmCam);
const film = new FilmPass(device, sceneTexture);
// The light preset shares one RGB ray instead of sampling each colour separately.
if (config.profile === 'performance' && params.get('film') !== 'full') film.lens[1] = 0;
film.init(null);
filmCam.camera.framePasses = [film];

// the splats render at `renderScale` of the output (chosen by the benchmark to hold the frame rate)
let renderScale = numeric(params, 'scale', config.profile === 'performance' ? 0.7 : 1, 0.35, 1);
function resizeTarget() {
    const w = Math.max(4, Math.round(device.width * OVERSCAN * renderScale));
    const h = Math.max(4, Math.round(device.height * OVERSCAN * renderScale));
    if (sceneTarget.width !== w || sceneTarget.height !== h) sceneTarget.resize(w, h);
}

// ---- the walk ----
const walk = new Walk(ROUTE);
console.log(`walk: ${walk.path.length.toFixed(1)} m, ${walk.duration.toFixed(1)} s`);

const pos = new pc.Vec3(), rot = new pc.Quat();
const W = new pc.Mat4(), Wt = new pc.Mat4(), Winv = new pc.Mat4(), M = new pc.Mat4();
const pA = new pc.Vec3(), qA = new pc.Quat();
const ONE = new pc.Vec3(1, 1, 1);

function poseMatrix(t, out) {
    walk.sample(t, pA, qA, look.gazeWeight);
    look.apply(qA);
    return out.setTRS(pA, qA, ONE);
}

// planes (n, d) in the rendered camera's space, from a world plane n.X + d = 0
const nW = new pc.Vec3(), nC = new pc.Vec3(), camP = new pc.Vec3();
function planeToCamera(nx, ny, nz, d, out) {
    nW.set(nx, ny, nz);
    Winv.transformVector(nW, nC);
    Wt.getTranslation(camP);
    out[0] = nC.x; out[1] = nC.y; out[2] = nC.z; out[3] = nx * camP.x + ny * camP.y + nz * camP.z + d;
}

function applyShot(t, exposure = true) {
    const H = 0.5 * (SHUTTER + READOUT);
    walk.sample(t, pos, rot, look.gazeWeight);
    look.apply(rot);
    camera.setPosition(pos);
    camera.setRotation(rot);
    Wt.setTRS(pos, rot, ONE);
    Winv.copy(Wt).invert();
    if (exposure && !look.dragging && !look.settling) {
        M.mul2(Winv, poseMatrix(t - H, W)); film.M0.set(M.data);
        M.mul2(Winv, poseMatrix(t + H, W)); film.M2.set(M.data);
    } else {
        film.M0.set(pc.Mat4.IDENTITY.data);
        film.M2.set(pc.Mat4.IDENTITY.data);
    }
    film.timing[0] = READOUT / H;
    film.timing[1] = SHUTTER / H;

    // depth proxy around the walker
    const z = pos.z;
    const fy = walk.floorAt(z);
    const wl = wallsAt(z);
    planeToCamera(0, 1, 0, -fy, film.floor);
    planeToCamera(0, -1, 0, fy + 13, film.ceil);
    planeToCamera(-1, 0, 0, -wl.a, film.wallL);  // face at world X = -a, facing -X
    planeToCamera(1, 0, 0, wl.b, film.wallR);    // face at world X = -b, facing +X

    // the clip ends on a fade to black
    film.look[3] = Math.min(1, Math.max(0, (walk.duration - t) / 1.4));
}

// ---- dynamic resolution: hold the frame rate by trimming the splat render size ----
const scaler = {
    ema: 0, last: 0, drops: 0, overloaded: 0,
    reset() { this.ema = 0; this.last = performance.now(); this.drops = 0; this.overloaded = 0; },
    // called after each video frame is produced; `skipped` = video frames missed since the last
    frame(skipped) {
        if (params.has('scale')) return;
        const gp = device.gpuProfiler;
        const budget = 0.86 * 1000 / FPS;
        const ms = gp?.enabled ? gp.frameTime : 0;
        if (ms > 0) this.ema = this.ema ? this.ema + (ms - this.ema) * 0.12 : ms;
        if (skipped > 0) this.drops += skipped;
        const now = performance.now();
        if (now - this.last < 900) return;
        this.last = now;
        let s = renderScale;
        if (this.ema > budget || this.drops > 2) {
            const f = this.ema > 0 ? Math.sqrt(budget * 0.92 / this.ema) : 0.93;
            s = renderScale * Math.max(0.85, Math.min(0.97, f));
        } else if (this.ema > 0 && this.ema < budget * 0.68 && this.drops === 0) {
            s = renderScale * 1.04;
        }
        s = Math.max(0.5, Math.min(1, Math.round(s * 40) / 40));
        if (s !== renderScale) {
            renderScale = s;
            if (DEBUG) console.log(`render scale ${s.toFixed(3)} (gpu ${this.ema.toFixed(1)} ms, drops ${this.drops})`);
        }
        // Fall back only when the current target cannot be held at minimum resolution.
        if (config.auto && !params.has('fps') && FPS === config.fps && FPS > 30 && s <= 0.5 && this.drops > 2) this.overloaded++;
        else this.overloaded = 0;
        if (this.overloaded >= 4) {
            FPS = 30; lastIndex = -1;
            document.getElementById('quality-status').textContent = '30 fps · device limit';
        }
        this.drops = 0;
    }
};

// ---- playback state ----
let state = 'loading';     // loading | bench | ready | playing | paused | ended | free
let tPlay = numeric(params, 't', 0, 0, walk.duration);   // shot time of the frame on screen
let clock = tPlay;                           // running clock while playing
let lastIndex = -1;
let frame = 0;
let lastFrameAt = -Infinity;
let dtAvg = 1 / 60;
let rate = numeric(params, 'rate', 1, 0.1, 4);
const knobs = { taps: config.taps };

// ---- tap to burn the world down to its Gaussians ----
const burn = new BurnFx(app);
const SKY = new pc.Color(0.84, 0.855, 0.875), NIGHT = new pc.Color(0.006, 0.008, 0.014);
const skyColor = new pc.Color().copy(SKY);

// where a tap lands: the camera ray through that pixel against the passage's floor, walls and lid
const rayDir = new pc.Vec3(), hitPoint = new pc.Vec3();
function tapPoint(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const nx = ((clientX - r.left) / r.width) * 2 - 1;
    const ny = 1 - ((clientY - r.top) / r.height) * 2;
    const lensScale = tanHalfDisplay / originalTan * 0.5625;
    const radius2 = (nx * nx * aspect * aspect + ny * ny) * lensScale * lensScale;
    const distortion = 1 + film.lens[0] * radius2;
    rayDir.set(nx * tanHalfDisplay * aspect * distortion, ny * tanHalfDisplay * distortion, -1);
    camera.getRotation().transformVector(rayDir, rayDir).normalize();
    const o = camera.getPosition();
    const fy = walk.floorAt(o.z), wl = wallsAt(o.z);
    let t = 24;
    const hit = (nx_, ny_, nz_, d) => {
        const nv = nx_ * rayDir.x + ny_ * rayDir.y + nz_ * rayDir.z;
        if (nv >= -1e-4) return;
        const s = -(nx_ * o.x + ny_ * o.y + nz_ * o.z + d) / nv;
        if (s > 0.2) t = Math.min(t, s);
    };
    hit(0, 1, 0, -fy);
    hit(0, -1, 0, fy + 13);
    hit(-1, 0, 0, -wl.a);
    hit(1, 0, 0, wl.b);
    return hitPoint.copy(rayDir).mulScalar(t).add(o);
}

function ignite(clientX, clientY) {
    if (!burn.installed || state === 'loading' || state === 'bench') return;
    const p = tapPoint(clientX, clientY);
    burn.trigger(p);
    soundtrack.playFx('fx-burn', -9);
    app.renderNextFrame = true;
    hint.classList.remove('show');
}
burn.onRestore = () => soundtrack.playFx('fx-restore', -11);

// ---- sound: while it plays, the audio clock drives the pictures ----
const soundtrack = new Soundtrack(walk);
soundtrack.muted = params.has('mute');
// Start decoding after the first user gesture; images never wait for optional audio.
let soundLoad;
function loadSound() { return soundLoad ??= soundtrack.load().catch(err => console.warn('soundtrack unavailable:', err)); }
let audioClock = false;   // video follows the soundtrack's clock
let starting = false;
let soundGeneration = 0;
function showControls() {
    document.body.classList.add('controls');
    clearTimeout(controlsTimer);
    controlsTimer = setTimeout(() => document.body.classList.remove('controls'), 3000);
}
const look = new CameraLook(canvas, ignite, () => {
    if (state !== 'playing') app.renderNextFrame = true;
}, showControls, () => !['loading', 'bench'].includes(state));

function renderFrame() {
    lastFrameAt = performance.now();
    film.glow[3] = tanHalfDisplay / originalTan * 0.5625;
    frame++;
    film.tan[0] = tanHalfDisplay * aspect; film.tan[1] = tanHalfDisplay;
    film.tan[2] = tanHalfDisplay * OVERSCAN * aspect; film.tan[3] = tanHalfDisplay * OVERSCAN;
    film.timing[2] = frame % 100000;
    film.timing[3] = knobs.taps;
    film.look[1] = Math.min(1, 1080 / device.height);
    resizeTarget();
    app.renderNextFrame = true;
}

app.on('update', (dt) => {
    if (probe?.frozen) return;
    const looking = look.update(dt);
    const interactionDue = performance.now() - lastFrameAt >= 1000 / FPS - 1;
    if (looking && interactionDue && !['loading', 'bench', 'playing'].includes(state)) app.renderNextFrame = true;
    dtAvg += (dt - dtAvg) * 0.05;
    // resize events can arrive before the new size is visible: compare every frame
    if (laidOut !== `${window.innerWidth}x${window.innerHeight}x${window.devicePixelRatio}`) layout();
    if (state === 'playing' && !starting) {
        if (audioClock && soundtrack.healthy) clock = Math.max(clock, soundtrack.time);
        else clock += Math.min(dt, 0.1) * rate;
        clock = Math.min(walk.duration, clock);
        const index = Math.floor(clock * FPS + 1e-4);
        if (index !== lastIndex) {
            const skipped = lastIndex >= 0 ? Math.max(0, index - lastIndex - 1) : 0;
            lastIndex = index;
            tPlay = index / FPS;
            applyShot(tPlay);
            renderFrame();
            scaler.frame(skipped);
        }
        if (clock >= walk.duration) end();
    } else if (state === 'bench') {
        bench.step(dt);
    } else if (state === 'free') {
        freeCam(dt);
        film.M0.set(pc.Mat4.IDENTITY.data);
        film.M2.set(pc.Mat4.IDENTITY.data);
        film.look[3] = 1;
        renderFrame();
    } else if (app.renderNextFrame || state === 'loading' || (burn.active && interactionDue && state !== 'bench')) {
        // paused, ready or ended: hold the frame, re-render only when something changed (or
        // while a burn is playing out over the held frame)
        if (state !== 'loading') applyShot(tPlay, state !== 'ready');
        renderFrame();
    }

    // the burn effect runs on real time, whatever the video is doing
    if (!burn.installed && state !== 'loading' && app.scene.gsplat.material) burn.install();
    if (burn.installed) {
        burn.update(Math.min(dt, 0.1), camera.getPosition());
        const dark = burn.darkness;
        camera.camera.clearColor = skyColor.lerp(SKY, NIGHT, dark);
        film.glow[0] = 0.06 + 0.05 * dark;
        film.glow[1] = 0.55 - 0.05 * dark;
    }

    if (DEBUG) {
        const p = camera.getPosition();
        const e = camera.getEulerAngles();
        hud.textContent = `t ${tPlay.toFixed(2)} / ${walk.duration.toFixed(1)}  ${state}  scale ${renderScale.toFixed(2)}\n` +
            `world ${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)}  ply ${(-p.x).toFixed(2)} ${(-p.y).toFixed(2)} ${p.z.toFixed(2)}\n` +
            `euler ${e.x.toFixed(1)} ${e.y.toFixed(1)} ${e.z.toFixed(1)}  raf ${(1 / Math.max(dtAvg, 1e-3)).toFixed(0)}  gpu ${device.gpuProfiler?.frameTime?.toFixed(1) ?? '-'}  ` +
            `${device.width}x${device.height} rt ${sceneTarget.width}x${sceneTarget.height} ${device.deviceType}`;
    }
});

// ---- benchmark: render a stretch of the walk unseen and pick the render scale ----
const bench = {
    t: 0, frames: 0, gpu: 0, pixelPart: 0, wall: 0, onDone: null,
    start(onDone) {
        probe?.mark('benchmarkStart');
        this.onDone = onDone;
        this.t = 0; this.frames = 0; this.gpu = 0; this.pixelPart = 0; this.wall = 0; this.n = 0;
        if (device.gpuProfiler) device.gpuProfiler.enabled = true;
        state = 'bench';
    },
    step(dt) {
        // sample the walk where it is busiest, at the video rate, with the output kept black
        const t0 = 16;
        if (this.frames > 0) this.wall += dt;
        const gp = device.gpuProfiler;
        if (this.frames > 8 && gp?.frameTime > 0) {
            this.gpu += gp.frameTime;
            let px = 0;
            for (const [k, v] of gp.passTimings) if (/Forward|Film|Compose/i.test(k) || k === film.name) px += v;
            this.pixelPart += px;
            this.n = (this.n ?? 0) + 1;
        }
        applyShot(t0 + this.frames / FPS);
        film.look[3] = 0;
        renderFrame();
        this.frames++;
        if (this.frames >= (config.profile === 'performance' ? 32 : 60)) this.finish();
    },
    finish() {
        const budget = 0.85 * 1000 / FPS;
        let gpu = 0, px = 0;
        if (this.n > 10) {
            gpu = this.gpu / this.n; px = this.pixelPart / this.n;
            if (px < 0.2 * gpu) px = 0.7 * gpu;   // no per-pass breakdown (WebGL): assume a typical split
        } else {
            // no GPU timer: judge by the frame interval (the bench renders every animation frame)
            gpu = 1000 * this.wall / Math.max(1, this.frames - 1); px = gpu * 0.6;
        }
        const fixed = Math.max(0, gpu - px);
        let s = 1;
        if (gpu > budget && px > 0) s = Math.sqrt(Math.max(0.05, (budget - fixed) / px));
        if (!params.has('scale')) renderScale = Math.max(0.5, Math.min(1, s * renderScale));
        console.log(`bench: ${this.n > 10 ? 'GPU' : 'frame interval (GPU timer unavailable)'} ${gpu.toFixed(1)} ms (estimated pixel part ${px.toFixed(1)}), budget ${budget.toFixed(1)} -> render scale ${renderScale.toFixed(2)}`);
        state = 'ready';
        probe?.mark('ready');
        this.onDone?.();
    }
};

// ---- free camera for exploring (debug) ----
let fyaw = 0, fpitch = 0;
function freeCam(dt) {
    const kb = app.keyboard;
    if (!kb) return;
    const speed = (kb.isPressed(pc.KEY_SHIFT) ? 6 : 1.5) * dt;
    const f = camera.forward, r = camera.right;
    const p = camera.getPosition().clone();
    if (kb.isPressed(pc.KEY_W)) p.add(f.clone().mulScalar(speed));
    if (kb.isPressed(pc.KEY_S)) p.sub(f.clone().mulScalar(speed));
    if (kb.isPressed(pc.KEY_D)) p.add(r.clone().mulScalar(speed));
    if (kb.isPressed(pc.KEY_A)) p.sub(r.clone().mulScalar(speed));
    if (kb.isPressed(pc.KEY_E)) p.y += speed;
    if (kb.isPressed(pc.KEY_Q)) p.y -= speed;
    camera.setPosition(p);
    camera.setEulerAngles(fpitch, fyaw, 0);
}
if (DEBUG) {
    app.mouse.on(pc.EVENT_MOUSEMOVE, (e) => {
        if (state !== 'free' || !app.mouse.isPressed(pc.MOUSEBUTTON_LEFT)) return;
        fyaw -= e.dx * 0.2; fpitch = Math.max(-85, Math.min(85, fpitch - e.dy * 0.2));
    });
}

// ---- load the scene ----
const isLod = SCENE_URL.split(/[?#]/)[0].endsWith('lod-meta.json');
const asset = new pc.Asset('artillery-passage', 'gsplat', { url: SCENE_URL });
asset.on('progress', (received, total) => {
    if (total && !isLod) {
        bar.style.transform = `scaleX(${Math.min(1, received / total).toFixed(4)})`;
        status.textContent = `Loading scene… ${(received / 1048576).toFixed(0)} / ${(total / 1048576).toFixed(0)} MB`;
    }
});
app.assets.add(asset);
asset.ready(() => {
    probe?.mark('manifestReady');
    const splat = new pc.Entity('splat');
    splat.addComponent('gsplat', { asset, unified: true });
    splat.setLocalEulerAngles(0, 0, 180);
    app.root.addChild(splat);

    // stand at the start of the walk while the chunks stream in
    applyShot(tPlay);
    film.look[3] = 0;
    let total = 0;
    let settled = 0;
    const onFrame = (cam, layer, ready, loading) => {
        if (cam !== camera.camera.camera && cam !== camera.camera) return;
        total = Math.max(total, loading);
        if (isLod && total > 0) {
            bar.style.transform = `scaleX(${(1 - loading / total).toFixed(4)})`;
            status.textContent = `Loading scene… ${total - loading} / ${total}`;
        }
        settled = ready && loading === 0 ? settled + 1 : 0;
        if (settled >= (isLod ? 20 : 3)) {
            probe?.mark('streamSettled');
            app.systems.gsplat.off('frame:ready', onFrame);
            status.textContent = 'Preparing…';
            bench.start(() => {
                if (DEBUG && params.has('free')) {
                    state = 'free';
                    const eu = camera.getEulerAngles();
                    fyaw = eu.y; fpitch = eu.x;
                }
                applyShot(tPlay);
                app.renderNextFrame = true;
                overlay.classList.add('ready');
                if (params.has('autoplay')) play();
            });
        }
    };
    app.systems.gsplat.on('frame:ready', onFrame);
    // keep rendering while loading so streaming progresses
    const keepAlive = () => { if (state === 'loading') renderFrame(); else app.off('update', keepAlive); };
    app.on('update', keepAlive);
});
asset.on('error', (err) => {
    status.textContent = 'Scene unavailable. Check your connection and retry.';
    document.getElementById('retry').hidden = false;
    probe?.fail(String(err)); console.error(err);
});
probe?.mark('sceneRequest');
app.assets.load(asset);

// ---- controls ----
function play() {
    if (state === 'loading' || state === 'bench') return;
    if (state === 'ended' || tPlay >= walk.duration) { tPlay = 0; look.reset(true); }
    clock = tPlay;
    lastIndex = -1;
    scaler.reset();
    state = 'playing';
    stage.inert = false;
    overlay.classList.add('hidden');
    overlay.inert = true;
    document.body.classList.add('playing');
    document.body.classList.remove('paused');
    pauseBtn.setAttribute('aria-label', 'Pause');
    startSound();
    // the first time through, say once that the picture can be touched
    if (!hintShown) {
        hintShown = true;
        setTimeout(() => { if (state === 'playing') hint.classList.add('show'); }, 2800);
        setTimeout(() => hint.classList.remove('show'), 8500);
    }
}
let hintShown = false;
// Images start immediately. When audio is decoded it joins at the current shot time.
async function startSound() {
    audioClock = false;
    if (rate !== 1 || soundtrack.muted) return;
    const generation = ++soundGeneration;
    const pending = loadSound();
    soundtrack.ctx?.resume().catch(() => {});
    await pending;
    if (generation !== soundGeneration || state !== 'playing') return;
    const current = () => generation === soundGeneration && state === 'playing';
    const ok = await soundtrack.start(tPlay, walk.duration, current);
    if (!current()) return;
    audioClock = ok;
    clock = tPlay;
}
function pause() {
    if (state !== 'playing') return;
    state = 'paused';
    soundGeneration++;
    soundtrack.stop();
    audioClock = false;
    document.body.classList.remove('playing');
    document.body.classList.add('paused');
    pauseBtn.setAttribute('aria-label', 'Play');
    app.renderNextFrame = true;
}
function end() {
    state = 'ended';
    soundGeneration++;
    soundtrack.stop();
    audioClock = false;
    document.body.classList.remove('playing');
    setTimeout(() => {
        if (state !== 'ended') return;
        overlay.classList.remove('hidden');
        overlay.inert = false;
        stage.inert = true;
        overlay.querySelector('#play').setAttribute('aria-label', 'Replay');
    }, 500);
}
function restart() {
    look.reset(true);
    tPlay = 0;
    state = 'paused';
    play();
}

document.getElementById('play').addEventListener('click', () => play());
window.addEventListener('keydown', (e) => {
    if (e.target.closest?.('button, select, input, textarea, a')) return;
    if (e.code === 'Space') {
        e.preventDefault();
        if (state === 'playing') pause();
        else if (state === 'paused' || state === 'ready' || state === 'ended') play();
    } else if (e.code === 'KeyR' && state !== 'loading' && state !== 'bench') {
        restart();
    } else if (e.code === 'KeyF') {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen?.();
    } else if (e.code === 'KeyM') {
        toggleMute();
    } else if (DEBUG && e.code === 'KeyC' && state !== 'loading' && state !== 'bench') {
        if (state === 'free') { state = 'paused'; app.renderNextFrame = true; } else {
            state = 'free';
            const eu = camera.getEulerAngles();
            fyaw = eu.y; fpitch = eu.x;
        }
    }
});
// tapping the picture burns it; the corner button (or Space) pauses
// CameraLook handles tap versus drag and pointer cancellation.
pauseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state === 'playing') pause(); else if (state === 'paused') play();
});
// show the controls (and the cursor) while the pointer moves, like a video player
let controlsTimer = 0;
window.addEventListener('pointermove', showControls);
document.getElementById('recenter').addEventListener('click', () => { look.reset(); showControls(); app.renderNextFrame = true; });
function toggleMute() {
    soundtrack.setMuted(!soundtrack.muted);
    document.getElementById('mute').textContent = soundtrack.muted ? 'Sound on' : 'Mute';
    if (!soundtrack.muted && state === 'playing' && !soundtrack.healthy) startSound();
}
document.getElementById('mute').textContent = soundtrack.muted ? 'Sound on' : 'Mute';
document.getElementById('mute').addEventListener('click', toggleMute);
const profileSelect = document.getElementById('quality');
profileSelect.value = config.auto ? 'auto' : config.profile;
profileSelect.addEventListener('change', () => {
    const query = new URLSearchParams(location.search);
    query.set('profile', profileSelect.value); query.delete('scene');
    location.search = query.toString();
});
document.getElementById('retry').addEventListener('click', () => location.reload());
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

// dev handle
window.__aw = {
    app, camera, walk, film, knobs, sceneTarget, device, gs: app.scene.gsplat,
    get t() { return tPlay; },
    get state() { return state; },
    get renderScale() { return renderScale; },
    set renderScale(v) { renderScale = v; app.renderNextFrame = true; },
    seek(t) {
        tPlay = t; clock = t; lastIndex = -1; applyShot(t); app.renderNextFrame = true;
        if (state === 'playing') startSound();
    },
    soundtrack, cameraLook: look, burn, config,
    // dev: render the shot at time t and save the canvas as captures/<name>.png
    async grab(t, name) {
        if (state === 'ended' || state === 'ready') state = 'paused';
        tPlay = t;
        applyShot(t);
        renderFrame();
        app.render();
        const c2 = document.createElement('canvas');
        c2.width = canvas.width; c2.height = canvas.height;
        c2.getContext('2d').drawImage(canvas, 0, 0);
        const blob = await new Promise(r => c2.toBlob(r, 'image/png'));
        await fetch(`/__frame?name=${encodeURIComponent(name)}`, { method: 'POST', body: blob });
        return `${c2.width}x${c2.height}`;
    },
    play, pause,
    setState(s) { state = s; app.renderNextFrame = true; },
    look(xPly, yPly, zPly, yaw, pitch) {
        state = 'free';
        const w = plyToWorld(xPly, yPly, zPly);
        camera.setPosition(w);
        fyaw = yaw; fpitch = pitch;
        camera.setEulerAngles(pitch, yaw, 0);
    }
};

probe?.attach({
    ...window.__aw, get time() { return tPlay; }, get state() { return state; },
    get scale() { return renderScale; }, get fps() { return FPS; }, sceneUrl: SCENE_URL, engine: pc.version,
    reset() { pause(); state = 'paused'; look.reset(true); tPlay = 0; clock = 0; lastIndex = -1; clearBurn(); },
    ignite() { const r = canvas.getBoundingClientRect(); ignite(r.left + r.width / 2, r.top + r.height / 2); },
    capture(t, effect = -1) {
        pause(); state = 'paused'; look.reset(true); probe.frozen = true; clearBurn();
        tPlay = t; clock = t; applyShot(t); frame = 99;
        if (effect >= 0) {
            burn.trigger(tapPoint(innerWidth / 2, innerHeight / 2));
            burn.slots[0].t = effect; burn.slots[0].restored = true;
        }
        burn.update(0, camera.getPosition());
        camera.camera.clearColor = skyColor.lerp(SKY, NIGHT, burn.darkness);
        film.glow[0] = 0.06 + 0.05 * burn.darkness;
        film.glow[1] = 0.55 - 0.05 * burn.darkness;
        renderFrame(); app.render(); app.renderNextFrame = false;
    }
});
function clearBurn() {
    for (const slot of burn.slots) { slot.t = -1; slot.restored = false; }
    burn._dirty = true;
    if (burn.installed) burn.update(0, camera.getPosition());
}
