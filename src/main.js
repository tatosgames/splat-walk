import * as pc from 'playcanvas';
import { FilmPass } from './post.js';
import { Walk, plyToWorld, wallsAt } from './walk.js';
import { ROUTE } from './route.js';
import { Soundtrack } from './audio.js';
import { BurnFx } from './burn.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
if (DEBUG) document.body.classList.add('debug');

// ---- the "camera": a phone-like main lens filming 1080p at 30 fps ----
const DISPLAY_VFOV = Number(params.get('fov') ?? 50);   // ~ 24 mm equivalent horizontally
const OVERSCAN = 1.1;                                  // spare image around the frame for shake, blur and lens
const FPS = Number(params.get('fps') ?? 30);
const SHUTTER = Number(params.get('shutter') ?? 1 / 80);
const READOUT = Number(params.get('readout') ?? 0.016);
const MAX_HEIGHT = Number(params.get('maxh') ?? 1080);
const SCENE_URL = params.get('scene') ?? './scene/lod-meta.json';

const canvas = document.getElementById('canvas');
const stage = document.getElementById('stage');
const overlay = document.getElementById('overlay');
const hud = document.getElementById('hud');
const hint = document.getElementById('hint');
const bar = overlay.querySelector('.bar');
const status = overlay.querySelector('.status');

const device = await pc.createGraphicsDevice(canvas, {
    deviceTypes: params.has('webgl') ? [pc.DEVICETYPE_WEBGL2] : [pc.DEVICETYPE_WEBGPU, pc.DEVICETYPE_WEBGL2],
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance'
});

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
function layout() {
    const ww = window.innerWidth, wh = window.innerHeight;
    laidOut = `${ww}x${wh}x${window.devicePixelRatio}`;
    let w = ww, h = Math.round(ww * 9 / 16);
    if (h > wh) { h = wh; w = Math.round(wh * 16 / 9); }
    stage.style.width = `${w}px`;
    stage.style.height = `${h}px`;
    const dpr = window.devicePixelRatio || 1;
    device.maxPixelRatio = Math.max(0.5, Math.min(dpr, 2, MAX_HEIGHT / h));
    app.resizeCanvas(w, h);
    app.renderNextFrame = true;
}
window.addEventListener('resize', layout);
layout();
app.start();

// ---- splat settings: smooth, pop-free view-dependent colour, everything at full detail ----
const gs = app.scene.gsplat;
gs.radialSorting = true;          // turning the head doesn't re-order splats
gs.colorUpdateAngle = Number(params.get('cua') ?? 0.6);
gs.splatBudget = 0;               // no LOD budget: the whole passage at its finest level
gs.lodUnderfillLimit = 0;

// ---- scene camera renders the splats into an HDR target, the film pass makes it footage ----
const camera = new pc.Entity('camera');
const tanHalfDisplay = Math.tan(DISPLAY_VFOV * Math.PI / 360);
camera.addComponent('camera', {
    clearColor: new pc.Color(0.84, 0.855, 0.875),
    fov: 2 * Math.atan(tanHalfDisplay * OVERSCAN) * 180 / Math.PI,
    nearClip: 0.2,
    farClip: 500,
    gammaCorrection: pc.GAMMA_SRGB,
    toneMapping: pc.TONEMAP_LINEAR
});
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
film.init(null);
filmCam.camera.framePasses = [film];

// the splats render at `renderScale` of the output (chosen by the benchmark to hold the frame rate)
let renderScale = Number(params.get('scale') ?? 1);
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
    walk.sample(t, pA, qA);
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
    walk.sample(t, pos, rot);
    camera.setPosition(pos);
    camera.setRotation(rot);
    Wt.setTRS(pos, rot, ONE);
    Winv.copy(Wt).invert();
    if (exposure) {
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
    ema: 0, last: 0, drops: 0,
    reset() { this.ema = 0; this.last = performance.now(); this.drops = 0; },
    // called after each video frame is produced; `skipped` = video frames missed since the last
    frame(skipped) {
        if (params.has('scale')) return;
        const gp = device.gpuProfiler;
        const budget = 0.86 * 1000 / FPS;
        const ms = gp?.enabled ? gp._frameTime : 0;
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
        this.drops = 0;
    }
};

// ---- playback state ----
let state = 'loading';     // loading | bench | ready | playing | paused | ended | free
let tPlay = Number(params.get('t') ?? 0);   // shot time of the frame on screen
let clock = tPlay;                           // running clock while playing
let lastIndex = -1;
let frame = 0;
let dtAvg = 1 / 60;
let rate = Number(params.get('rate') ?? 1);
const knobs = { taps: Number(params.get('taps') ?? 10) };

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
    rayDir.set(nx * tanHalfDisplay * 16 / 9, ny * tanHalfDisplay, -1);
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
const soundLoad = soundtrack.load().catch((err) => console.warn('soundtrack unavailable:', err));
let audioClock = false;   // video follows the soundtrack's clock
let starting = false;     // waiting for the audio to start

function renderFrame() {
    frame++;
    film.tan[0] = tanHalfDisplay * 16 / 9; film.tan[1] = tanHalfDisplay;
    film.tan[2] = tanHalfDisplay * OVERSCAN * 16 / 9; film.tan[3] = tanHalfDisplay * OVERSCAN;
    film.timing[2] = frame % 100000;
    film.timing[3] = knobs.taps;
    film.look[1] = Math.min(1, 1080 / device.height);
    resizeTarget();
    app.renderNextFrame = true;
}

app.on('update', (dt) => {
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
    } else if (app.renderNextFrame || state === 'loading' || (burn.active && state !== 'bench')) {
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
            `euler ${e.x.toFixed(1)} ${e.y.toFixed(1)} ${e.z.toFixed(1)}  raf ${(1 / Math.max(dtAvg, 1e-3)).toFixed(0)}  gpu ${device.gpuProfiler?._frameTime?.toFixed(1) ?? '-'}  ` +
            `${device.width}x${device.height} rt ${sceneTarget.width}x${sceneTarget.height} ${device.deviceType}`;
    }
});

// ---- benchmark: render a stretch of the walk unseen and pick the render scale ----
const bench = {
    t: 0, frames: 0, gpu: 0, pixelPart: 0, wall: 0, onDone: null,
    start(onDone) {
        this.onDone = onDone;
        this.t = 0; this.frames = 0; this.gpu = 0; this.pixelPart = 0; this.wall = 0;
        if (device.gpuProfiler) device.gpuProfiler.enabled = true;
        state = 'bench';
    },
    step(dt) {
        // sample the walk where it is busiest, at the video rate, with the output kept black
        const t0 = 16;
        if (this.frames > 0) this.wall += dt;
        const gp = device.gpuProfiler;
        if (this.frames > 8 && gp?._frameTime > 0) {
            this.gpu += gp._frameTime;
            let px = 0;
            for (const [k, v] of gp._passTimings) if (/Forward|Film|Compose/i.test(k)) px += v;
            this.pixelPart += px;
            this.n = (this.n ?? 0) + 1;
        }
        applyShot(t0 + this.frames / FPS);
        film.look[3] = 0;
        renderFrame();
        this.frames++;
        if (this.frames >= 60) this.finish();
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
        console.log(`bench: gpu ${gpu.toFixed(1)} ms (pixels ${px.toFixed(1)}), budget ${budget.toFixed(1)} -> render scale ${renderScale.toFixed(2)}`);
        state = 'ready';
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
const isLod = SCENE_URL.endsWith('lod-meta.json');
const asset = new pc.Asset('artillery-passage', 'gsplat', { url: SCENE_URL });
asset.on('progress', (received, total) => {
    if (total && !isLod) {
        bar.style.width = `${(100 * received / total).toFixed(1)}%`;
        status.textContent = `Loading scene… ${(received / 1048576).toFixed(0)} / ${(total / 1048576).toFixed(0)} MB`;
    }
});
app.assets.add(asset);
asset.ready(() => {
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
            bar.style.width = `${(100 * (1 - loading / total)).toFixed(1)}%`;
            status.textContent = `Loading scene… ${total - loading} / ${total}`;
        }
        settled = ready && loading === 0 ? settled + 1 : 0;
        if (settled >= 20) {
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
asset.on('error', (err) => { status.textContent = `Failed to load: ${err}`; });
app.assets.load(asset);

// ---- controls ----
function play() {
    if (state === 'loading' || state === 'bench') return;
    if (state === 'ended' || tPlay >= walk.duration) { tPlay = 0; }
    clock = tPlay;
    lastIndex = -1;
    scaler.reset();
    state = 'playing';
    overlay.classList.add('hidden');
    document.body.classList.add('playing');
    document.body.classList.remove('paused');
    startSound();
    // the first time through, say once that the picture can be touched
    if (!hintShown) {
        hintShown = true;
        setTimeout(() => { if (state === 'playing') hint.classList.add('show'); }, 2800);
        setTimeout(() => hint.classList.remove('show'), 8500);
    }
}
let hintShown = false;
// start the soundtrack at the current shot time; the pictures wait for it (a few ms) and then
// follow its clock. Without sound (no Web Audio, blocked autoplay, odd playback rate) they run alone.
async function startSound() {
    audioClock = false;
    if (rate !== 1) return;
    starting = true;
    await soundLoad;
    const ok = await soundtrack.start(tPlay, walk.duration);
    starting = false;
    if (state !== 'playing') { soundtrack.stop(); return; }
    audioClock = ok;
    clock = tPlay;
}
function pause() {
    if (state !== 'playing') return;
    state = 'paused';
    soundtrack.stop();
    audioClock = false;
    document.body.classList.remove('playing');
    document.body.classList.add('paused');
    app.renderNextFrame = true;
}
function end() {
    state = 'ended';
    soundtrack.stop();
    audioClock = false;
    document.body.classList.remove('playing');
    setTimeout(() => {
        if (state !== 'ended') return;
        overlay.classList.remove('hidden');
        overlay.querySelector('#play').setAttribute('aria-label', 'Replay');
    }, 500);
}
function restart() {
    tPlay = 0;
    state = 'paused';
    play();
}

document.getElementById('play').addEventListener('click', () => play());
window.addEventListener('keydown', (e) => {
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
        soundtrack.setMuted(!soundtrack.muted);
    } else if (DEBUG && e.code === 'KeyC' && state !== 'loading' && state !== 'bench') {
        if (state === 'free') { state = 'paused'; app.renderNextFrame = true; } else {
            state = 'free';
            const eu = camera.getEulerAngles();
            fyaw = eu.y; fpitch = eu.x;
        }
    }
});
// tapping the picture burns it; the corner button (or Space) pauses
canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    ignite(e.clientX, e.clientY);
});
const pauseBtn = document.getElementById('pausebtn');
pauseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state === 'playing') pause(); else if (state === 'paused') play();
});
// show the controls (and the cursor) while the pointer moves, like a video player
let controlsTimer = 0;
window.addEventListener('pointermove', () => {
    document.body.classList.add('controls');
    clearTimeout(controlsTimer);
    controlsTimer = setTimeout(() => document.body.classList.remove('controls'), 2200);
});
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
    soundtrack,
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
