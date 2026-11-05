import { TYPE_UINT32 } from 'playcanvas';

// "Burn to Gaussians": tap the picture and a shockwave of fire races out from that point through
// the scan. As it passes, every Gaussian flashes white-hot, turns into its own glowing outline (the
// actual elliptical footprint the scan is made of), then collapses into a small glowing dot that
// drifts up like an ember, while the world behind falls into darkness. A few seconds later a cool
// cyan wave sweeps out from the same point: the dots fly home, flash through their outlines again
// and re-inflate into the photoreal scene.
//
// It runs in the engine's per-splat customization hooks: gsplatModifyVS (centre, shape and colour
// of each splat, evaluated once per splat per frame - in the GPU projector compute on WebGPU) and
// gsplatModifyPS (the shape of each fragment). The per-splat state reaches the fragments packed
// into one 32-bit varying: outline, dot, ember heat and hue as four bytes.
//
// Two taps can be in flight at once (slots A and B).

const commonWGSL = /* wgsl */`
uniform uFxA: vec4f;     // slot A: origin (world), seconds since the tap (< 0: idle)
uniform uFxB: vec4f;     // slot B
uniform uFxShape: vec4f; // burn reach (m), burn time constant (s), restore delay (s), restore time constant (s)
uniform uFxCam: vec4f;   // camera position, dot size (sigma) per metre of distance

var<private> fx_on: bool;
var<private> fx_keep: f32;
var<private> fx_ring: f32;
var<private> fx_dot: f32;
var<private> fx_ember: f32;
var<private> fx_heat: f32;
var<private> fx_hue: f32;
var<private> fx_flash: vec3f;
var<private> fx_drift: vec3f;

fn fxHash(p: vec3f) -> vec3f {
    let q = vec3f(dot(p, vec3f(127.1, 311.7, 74.7)), dot(p, vec3f(269.5, 183.3, 246.1)), dot(p, vec3f(113.5, 271.9, 124.6)));
    return fract(sin(q) * 43758.5453);
}

fn fxSlot(slot: vec4f, c: vec3f, h: vec3f) {
    let tau = slot.w;
    if (tau < 0.0) { return; }
    let shape = uniform.uFxShape;
    let reach = shape.x;
    let d = distance(c, slot.xyz);
    if (d > reach) { return; }
    // the burn front slows as it spreads (R = reach (1 - e^-t/T)); stages run on the time since
    // it reached this splat, so they read the same near and far
    let tb = -shape.y * log(1.0 - d / reach);
    let since = tau - tb;
    if (since < -0.2) { return; }
    // the restore front starts later from the same point and sweeps a little faster
    let tr = tau - shape.z;
    var sr = -10.0;
    if (tr > 0.0) { sr = tr + shape.w * log(1.0 - d / (reach + 4.0)); }

    let back = smoothstep(0.0, 0.55, sr);          // dots flying home and growing back
    let whole = smoothstep(0.6, 1.05, sr);         // fully photoreal again
    let ring = smoothstep(-0.05, 0.12, since) * (1.0 - smoothstep(0.75, 1.25, since)) * (1.0 - back)
             + smoothstep(0.2, 0.4, sr) * (1.0 - whole);
    let dotv = smoothstep(0.75, 1.35, since) * (1.0 - back);
    let flashB = exp(-(since * since) / 0.008) * (1.0 - back);
    let flashR = exp(-((sr - 0.06) * (sr - 0.06)) / 0.008);
    let ember = dotv * exp(-max(since - 0.9, 0.0) / 0.8);

    // the dots keep the solid splats only, about half of them, so the cloud stays crisp
    let keep = select(0.0, 1.0, h.y < 0.55);

    // embers: each dot drifts its own way, mostly up and away from the blast, then flies home
    let radial = normalize(c - slot.xyz + vec3f(0.0, 1e-3, 0.0));
    let dir = (h - vec3f(0.5)) * 0.6 + vec3f(0.0, 0.5, 0.0) + radial * 0.3;
    let mag = 0.4 * (1.0 - exp(-max(since - 0.7, 0.0) / 1.8)) * (1.0 - back);
    let wob = sin(tau * 2.1 + h.x * 6.2832) * 0.03 * dotv;
    fx_drift = fx_drift + dir * mag + vec3f(0.0, wob, 0.0) + radial * 0.05 * flashB;

    fx_ring = max(fx_ring, ring);
    fx_dot = max(fx_dot, dotv);
    fx_keep = min(fx_keep, mix(1.0, keep, dotv));
    fx_ember = max(fx_ember, ember);
    fx_heat = max(fx_heat, max(ember, ring * (1.0 - clamp(since / 1.1, 0.0, 1.0)) * (1.0 - back)));
    fx_hue = max(fx_hue, smoothstep(-0.1, 0.1, sr));
    fx_flash = fx_flash + vec3f(0.8, 0.5, 0.22) * flashB + vec3f(0.12, 0.3, 0.5) * flashR;
    fx_on = true;
}
`;

const vsWGSL = commonWGSL + /* wgsl */`
fn modifySplatCenter(center: ptr<function, vec3f>) {
    fx_on = false; fx_keep = 1.0; fx_ring = 0.0; fx_dot = 0.0; fx_ember = 0.0; fx_heat = 0.0; fx_hue = 0.0;
    fx_flash = vec3f(0.0); fx_drift = vec3f(0.0);
    if (uniform.uFxA.w < 0.0 && uniform.uFxB.w < 0.0) { return; }
    let c = *center;
    let h = fxHash(c);
    fxSlot(uniform.uFxA, c, h);
    fxSlot(uniform.uFxB, c, h);
    if (fx_on) { *center = c + fx_drift; }
}

fn modifySplatRotationScale(originalCenter: vec3f, modifiedCenter: vec3f, rotation: ptr<function, vec4f>, scale: ptr<function, vec3f>) {
    if (!fx_on) { return; }
    let size = gsplatGetSizeFromScale(*scale);
    let camD = distance(modifiedCenter, uniform.uFxCam.xyz);
    let dotSize = min(clamp(camD * uniform.uFxCam.w, 0.002, 0.02), size);
    *scale = mix(*scale, vec3f(dotSize), fx_dot) * (1.0 + clamp(length(fx_flash) * 0.06, 0.0, 0.2));
}

fn modifySplatColor(center: vec3f, color: ptr<function, vec4f>) {
    var packed = 0u;
    if (fx_on) {
        let a = (*color).a;
        // as dots, only the splats that carry the surfaces stay, at full strength
        let aDot = smoothstep(0.2, 0.45, a) * fx_keep;
        let rgb = (*color).rgb * (1.0 + 0.4 * fx_ember) + vec3f(0.9, 0.3, 0.06) * fx_ember * 0.6 + fx_flash;
        *color = vec4f(rgb, mix(a, aDot, fx_dot));
        packed = pack4x8unorm(vec4f(fx_ring, fx_dot, fx_heat, fx_hue));
    }
    #ifdef GSPLAT_USER_VARYINGS
        setFx(packed);
    #endif
}
`;

const psWGSL = /* wgsl */`
fn modifySplatColor(gaussianUV: vec2f, color: ptr<function, vec4f>) {
    #ifdef GSPLAT_USER_VARYINGS
        let r = length(gaussianUV);
        let fw = fwidth(r);
        let w = max(fw * 1.1, 0.008);
        let fx = unpack4x8unorm(getFx());
        let ring = fx.x;
        let dotv = fx.y;
        if (ring + dotv < 0.004) { return; }
        let ember = fx.z;
        let hue = fx.w;
        let base = *color;
        // the splat's own opacity, from the fragment alpha and the gaussian falloff
        let fall = max((exp(-4.0 * r * r) - 0.0183156) / 0.9816844, 1e-3);
        let op = clamp(base.a / fall, 0.0, 1.0);
        // its outline, drawn where the gaussian is ~1.75 sigma out
        // outlines only for splats a few pixels across or more - tiny ones would just fill in
        let big = 1.0 - smoothstep(0.03, 0.08, fw);
        let ringA = (1.0 - smoothstep(0.0, w, abs(r - 0.62))) * clamp(op * 2.0, 0.0, 1.0) * 0.6 * big;
        // burn outlines start yellow-hot and cool to deep orange; restore outlines are cyan
        let fire = mix(vec3f(1.0, 0.3, 0.05), vec3f(1.4, 0.85, 0.35), ember);
        let ringCol = mix(fire, vec3f(0.3, 0.85, 1.3), hue) + base.rgb * 0.4;
        // a hard little disc with a hot core
        let disc = 1.0 - smoothstep(0.36, 0.56, r);
        let core = 1.0 - smoothstep(0.0, 0.3, r);
        let dotA = disc * op;
        let dotCol = base.rgb * (1.0 + 0.6 * ember * core) + vec3f(0.8, 0.25, 0.05) * ember * core;
        // small splats skip the outline and go straight to a hot dot
        let s = max(ring + dotv, 1.0);
        let wR = ring * big / s;
        let wD = (dotv + ring * (1.0 - big)) / s;
        let wG = max(0.0, 1.0 - wR - wD);
        let a = wG * base.a + wR * ringA + wD * dotA;
        let pm = wG * base.rgb * base.a + wR * ringCol * ringA + wD * dotCol * dotA;
        *color = vec4f(pm / max(a, 1e-4), a);
    #endif
}
`;

const commonGLSL = /* glsl */`
uniform vec4 uFxA;
uniform vec4 uFxB;
uniform vec4 uFxShape;
uniform vec4 uFxCam;

bool fx_on;
float fx_keep;
float fx_ring;
float fx_dot;
float fx_ember;
float fx_heat;
float fx_hue;
vec3 fx_flash;
vec3 fx_drift;

vec3 fxHash(vec3 p) {
    vec3 q = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
    return fract(sin(q) * 43758.5453);
}

void fxSlot(vec4 slot, vec3 c, vec3 h) {
    float tau = slot.w;
    if (tau < 0.0) return;
    float reach = uFxShape.x;
    float d = distance(c, slot.xyz);
    if (d > reach) return;
    float tb = -uFxShape.y * log(1.0 - d / reach);
    float since = tau - tb;
    if (since < -0.2) return;
    float tr = tau - uFxShape.z;
    float sr = -10.0;
    if (tr > 0.0) sr = tr + uFxShape.w * log(1.0 - d / (reach + 4.0));

    float back = smoothstep(0.0, 0.55, sr);
    float whole = smoothstep(0.6, 1.05, sr);
    float ring = smoothstep(-0.05, 0.12, since) * (1.0 - smoothstep(0.75, 1.25, since)) * (1.0 - back)
               + smoothstep(0.2, 0.4, sr) * (1.0 - whole);
    float dotv = smoothstep(0.75, 1.35, since) * (1.0 - back);
    float flashB = exp(-(since * since) / 0.008) * (1.0 - back);
    float flashR = exp(-((sr - 0.06) * (sr - 0.06)) / 0.008);
    float ember = dotv * exp(-max(since - 0.9, 0.0) / 0.8);
    float keep = h.y < 0.55 ? 1.0 : 0.0;

    vec3 radial = normalize(c - slot.xyz + vec3(0.0, 1e-3, 0.0));
    vec3 dir = (h - 0.5) * 0.6 + vec3(0.0, 0.5, 0.0) + radial * 0.3;
    float mag = 0.4 * (1.0 - exp(-max(since - 0.7, 0.0) / 1.8)) * (1.0 - back);
    float wob = sin(tau * 2.1 + h.x * 6.2832) * 0.03 * dotv;
    fx_drift += dir * mag + vec3(0.0, wob, 0.0) + radial * 0.05 * flashB;

    fx_ring = max(fx_ring, ring);
    fx_dot = max(fx_dot, dotv);
    fx_keep = min(fx_keep, mix(1.0, keep, dotv));
    fx_ember = max(fx_ember, ember);
    fx_heat = max(fx_heat, max(ember, ring * (1.0 - clamp(since / 1.1, 0.0, 1.0)) * (1.0 - back)));
    fx_hue = max(fx_hue, smoothstep(-0.1, 0.1, sr));
    fx_flash += vec3(0.8, 0.5, 0.22) * flashB + vec3(0.12, 0.3, 0.5) * flashR;
    fx_on = true;
}

uint fxPack(vec4 v) {
    uvec4 b = uvec4(clamp(v, 0.0, 1.0) * 255.0 + 0.5);
    return b.x | (b.y << 8u) | (b.z << 16u) | (b.w << 24u);
}
`;

const vsGLSL = commonGLSL + /* glsl */`
void modifySplatCenter(inout vec3 center) {
    fx_on = false; fx_keep = 1.0; fx_ring = 0.0; fx_dot = 0.0; fx_ember = 0.0; fx_heat = 0.0; fx_hue = 0.0;
    fx_flash = vec3(0.0); fx_drift = vec3(0.0);
    if (uFxA.w < 0.0 && uFxB.w < 0.0) return;
    vec3 c = center;
    vec3 h = fxHash(c);
    fxSlot(uFxA, c, h);
    fxSlot(uFxB, c, h);
    if (fx_on) center = c + fx_drift;
}

void modifySplatRotationScale(vec3 originalCenter, vec3 modifiedCenter, inout vec4 rotation, inout vec3 scale) {
    if (!fx_on) return;
    float size = gsplatGetSizeFromScale(scale);
    float camD = distance(modifiedCenter, uFxCam.xyz);
    float dotSize = min(clamp(camD * uFxCam.w, 0.002, 0.02), size);
    scale = mix(scale, vec3(dotSize), fx_dot) * (1.0 + clamp(length(fx_flash) * 0.06, 0.0, 0.2));
}

void modifySplatColor(vec3 center, inout vec4 color) {
    uint packed = 0u;
    if (fx_on) {
        float a = color.a;
        float aDot = smoothstep(0.2, 0.45, a) * fx_keep;
        vec3 rgb = color.rgb * (1.0 + 0.4 * fx_ember) + vec3(0.9, 0.3, 0.06) * fx_ember * 0.6 + fx_flash;
        color = vec4(rgb, mix(a, aDot, fx_dot));
        packed = fxPack(vec4(fx_ring, fx_dot, fx_heat, fx_hue));
    }
    #ifdef GSPLAT_USER_VARYINGS
        setFx(packed);
    #endif
}
`;

const psGLSL = /* glsl */`
void modifySplatColor(vec2 gaussianUV, inout vec4 color) {
    #ifdef GSPLAT_USER_VARYINGS
        float r = length(gaussianUV);
        float fw = fwidth(r);
        float w = max(fw * 1.1, 0.008);
        uint p = getFx();
        vec4 fx = vec4(float(p & 255u), float((p >> 8u) & 255u), float((p >> 16u) & 255u), float(p >> 24u)) / 255.0;
        float ring = fx.x;
        float dotv = fx.y;
        if (ring + dotv < 0.004) return;
        float ember = fx.z;
        float hue = fx.w;
        vec4 base = color;
        float fall = max((exp(-4.0 * r * r) - 0.0183156) / 0.9816844, 1e-3);
        float op = clamp(base.a / fall, 0.0, 1.0);
        float big = 1.0 - smoothstep(0.03, 0.08, fw);
        float ringA = (1.0 - smoothstep(0.0, w, abs(r - 0.62))) * clamp(op * 2.0, 0.0, 1.0) * 0.6 * big;
        vec3 fire = mix(vec3(1.0, 0.3, 0.05), vec3(1.4, 0.85, 0.35), ember);
        vec3 ringCol = mix(fire, vec3(0.3, 0.85, 1.3), hue) + base.rgb * 0.4;
        float disc = 1.0 - smoothstep(0.36, 0.56, r);
        float core = 1.0 - smoothstep(0.0, 0.3, r);
        float dotA = disc * op;
        vec3 dotCol = base.rgb * (1.0 + 0.6 * ember * core) + vec3(0.8, 0.25, 0.05) * ember * core;
        float s = max(ring + dotv, 1.0);
        float wR = ring * big / s;
        float wD = (dotv + ring * (1.0 - big)) / s;
        float wG = max(0.0, 1.0 - wR - wD);
        float a = wG * base.a + wR * ringA + wD * dotA;
        vec3 pm = wG * base.rgb * base.a + wR * ringCol * ringA + wD * dotCol * dotA;
        color = vec4(pm / max(a, 1e-4), a);
    #endif
}
`;

export class BurnFx {
    constructor(app) {
        this.app = app;
        this.device = app.graphicsDevice;
        this.slots = [{ t: -1, o: [0, 0, 0], age: 0 }, { t: -1, o: [0, 0, 0], age: 0 }];
        // burn reach (m), burn time constant (s), restore delay (s), restore time constant (s)
        this.shape = [24, 3.0, 5.0, 1.6];
        this.dotScale = 0.0009;
        this._a = new Float32Array(4);
        this._b = new Float32Array(4);
        this._shape = new Float32Array(this.shape);
        this._cam = new Float32Array(4);
        this._dirty = true;
        this.installed = false;
        this.onRestore = null;   // callback(slotIndex) when a restore wave starts
    }

    // install the shader hooks once (compiled while the app prepares, never swapped afterwards)
    install() {
        const gs = this.app.scene.gsplat;
        gs.varyings.add([{ name: 'fx', type: TYPE_UINT32, components: 1 }]);
        const mat = gs.material;
        const wgsl = this.device.isWebGPU;
        const chunks = mat.getShaderChunks(wgsl ? 'wgsl' : 'glsl');
        chunks.set('gsplatModifyVS', wgsl ? vsWGSL : vsGLSL);
        chunks.set('gsplatModifyPS', wgsl ? psWGSL : psGLSL);
        this.material = mat;
        this._write([0, 0, 0]);
        mat.update();
        this.installed = true;
    }

    get duration() {
        // when the restore front has passed the edge of the burn and settled
        const [reach, , delay, tauR] = this.shape;
        return delay - tauR * Math.log(1 - reach / (reach + 4)) + 1.5;
    }

    get active() {
        return this.slots.some(s => s.t >= 0);
    }

    /** Starts a burn at a world point; reuses an idle slot, else the one furthest along. */
    trigger(p) {
        let slot = this.slots.find(s => s.t < 0);
        if (!slot) slot = this.slots.reduce((a, b) => (a.t > b.t ? a : b));
        slot.t = 0;
        slot.o = [p.x, p.y, p.z];
        slot.restored = false;
        this._dirty = true;
        return this.slots.indexOf(slot);
    }

    /** How dark the world behind should be, 0..1 */
    get darkness() {
        const delay = this.shape[2];
        let d = 0;
        for (const s of this.slots) {
            if (s.t < 0) continue;
            const up = smoothstep(0.4, 2.6, s.t);
            const down = 1 - smoothstep(delay + 0.3, delay + 2.4, s.t);
            d = Math.max(d, up * down);
        }
        return d;
    }

    update(dt, camPos) {
        const delay = this.shape[2];
        let any = false;
        this.slots.forEach((s, i) => {
            if (s.t < 0) return;
            s.t += dt;
            if (!s.restored && s.t >= delay - 0.3) { s.restored = true; this.onRestore?.(i); }
            if (s.t > this.duration) s.t = -1;
            any = true;
        });
        if (!any && !this._dirty) return;
        this._write([camPos.x, camPos.y, camPos.z]);
        this.material.update();
        this._dirty = any;
    }

    _write(cam) {
        const [A, B] = this.slots;
        this._a.set([A.o[0], A.o[1], A.o[2], A.t]);
        this._b.set([B.o[0], B.o[1], B.o[2], B.t]);
        this._shape.set(this.shape);
        this._cam.set([cam[0], cam[1], cam[2], this.dotScale]);
        const m = this.material;
        m.setParameter('uFxA', this._a);
        m.setParameter('uFxB', this._b);
        m.setParameter('uFxShape', this._shape);
        m.setParameter('uFxCam', this._cam);
    }
}

function smoothstep(a, b, x) {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
}
