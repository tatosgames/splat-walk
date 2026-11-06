import { RenderPassShaderQuad, SEMANTIC_POSITION, ShaderUtils } from 'playcanvas';

// The "camera body": turns the clean pinhole render of the splats into footage that reads as a
// handheld video. For every output pixel it rebuilds the ray the lens would have seen (barrel
// distortion, lateral chromatic aberration), then integrates that ray over the exposure using the
// real camera path: the shutter is open for `shutter` seconds and the sensor is read out top to
// bottom over `readout` seconds (rolling shutter). Each sample reprojects the ray from the camera
// pose at that instant into the rendered frame. Depth for the translation part comes from an
// analytic proxy of the passage (floor, two walls, a lid), which is what matters for the blur of
// near walls and paving. Then light halation, sharpening as phone pipelines do, vignetting,
// sensor noise at 1080p scale.

const glslVS = /* glsl */ `
    attribute vec2 aPosition;
    varying vec2 ndc;
    void main(void) {
        gl_Position = vec4(aPosition, 0.0, 1.0);
        ndc = aPosition;
    }
`;

const glslFS = /* glsl */ `
    uniform sampler2D sceneTex;
    uniform mat4 uM0;
    uniform mat4 uM2;
    uniform vec4 uTan;
    uniform vec4 uTiming;
    uniform vec4 uFloor;
    uniform vec4 uWallL;
    uniform vec4 uWallR;
    uniform vec4 uCeil;
    uniform vec4 uLens;
    uniform vec4 uLook;
    uniform vec4 uGlow;
    uniform vec4 uRes;
    varying vec2 ndc;

    float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
    }
    vec3 toLin(vec3 c) { return pow(max(c, vec3(0.0)), vec3(2.2)); }
    vec3 toSrgb(vec3 c) { return pow(max(c, vec3(0.0)), vec3(1.0 / 2.2)); }

    float hitPlane(vec4 pl, vec3 o, vec3 v, float tMin) {
        float nv = dot(pl.xyz, v);
        if (nv >= -1e-4) return tMin;
        float t = -(dot(pl.xyz, o) + pl.w) / nv;
        return t > 0.0 ? min(tMin, t) : tMin;
    }
    vec2 projectUv(vec3 P) {
        float z = max(-P.z, 1e-3);
        vec2 n = (P.xy / z) / uTan.zw;
        return getImageEffectUV(n * 0.5 + 0.5);
    }
    vec3 originAt(float f) {
        return f < 0.0 ? -f * uM0[3].xyz : f * uM2[3].xyz;
    }
    vec3 dirAt(vec3 d, float f) {
        return f < 0.0 ? d - f * ((uM0 * vec4(d, 0.0)).xyz - d) : d + f * ((uM2 * vec4(d, 0.0)).xyz - d);
    }
    float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
    // above 0.9 the values ease towards 1; very bright colours also drift towards white, as an
    // overexposed sensor does, rather than keeping their hue
    vec3 softClip(vec3 c) {
        vec3 k = 0.9 + 0.1 * (1.0 - exp(-(max(c - 0.9, vec3(0.0))) / 0.1));
        vec3 s = mix(c, k, step(vec3(0.9), c));
        float over = max(max(c.r, c.g), c.b);
        return mix(s, vec3(1.0), smoothstep(1.2, 3.0, over) * 0.6);
    }

    void main(void) {
        vec2 n = ndc;
        vec2 q = n * uTan.xy;
        // Calibrate lens radius to the original landscape lens, not viewport width.
        vec2 rho = vec2(n.x * uTan.x / uTan.y, n.y) * uGlow.w;
        float r2 = dot(rho, rho);
        vec3 dR = vec3(q * (1.0 + (uLens.x + uLens.y) * r2), -1.0);
        vec3 dG = vec3(q * (1.0 + uLens.x * r2), -1.0);
        vec3 dB = vec3(q * (1.0 + (uLens.x - uLens.y) * r2), -1.0);

        float rowF = (0.5 - n.y * 0.5 - 0.5) * uTiming.x;
        float jitter = hash12(gl_FragCoord.xy + fract(uTiming.z * 0.6180339) * 113.0);
        int taps = int(uTiming.w);
        vec3 acc = vec3(0.0);
        vec2 uvC = vec2(0.0);
        for (int i = 0; i < 24; i++) {
            if (i >= taps) break;
            float s = (float(i) + jitter) / float(taps) - 0.5;
            float f = clamp(rowF + s * uTiming.y, -1.0, 1.0);
            vec3 o = originAt(f);
            vec3 vG = dirAt(dG, f);
            float t = 120.0;
            t = hitPlane(uFloor, o, vG, t);
            t = hitPlane(uWallL, o, vG, t);
            t = hitPlane(uWallR, o, vG, t);
            t = hitPlane(uCeil, o, vG, t);
            vec2 uvG = projectUv(o + vG * t);
            if (uLens.y == 0.0) {
                acc += toLin(textureLod(sceneTex, uvG, 0.0).rgb);
            } else {
                vec2 uvR = projectUv(o + dirAt(dR, f) * t);
                vec2 uvB = projectUv(o + dirAt(dB, f) * t);
                acc.r += toLin(textureLod(sceneTex, uvR, 0.0).rgb).r;
                acc.g += toLin(textureLod(sceneTex, uvG, 0.0).rgb).g;
                acc.b += toLin(textureLod(sceneTex, uvB, 0.0).rgb).b;
            }
            uvC += uvG;
        }
        vec3 col = acc / float(taps);
        uvC /= float(taps);

        // halation around bright sky and lamps
        vec3 g = toLin(textureLod(sceneTex, uvC, uGlow.z).rgb);
        col += max(g - uGlow.y, vec3(0.0)) * uGlow.x;

        vec3 disp = toSrgb(col);

        // phone-style sharpening on luma
        vec2 px = uRes.zw;
        float lc = luma(textureLod(sceneTex, uvC, 0.0).rgb);
        float ln = luma(textureLod(sceneTex, uvC + vec2(px.x, 0.0), 0.0).rgb) + luma(textureLod(sceneTex, uvC - vec2(px.x, 0.0), 0.0).rgb) +
                   luma(textureLod(sceneTex, uvC + vec2(0.0, px.y), 0.0).rgb) + luma(textureLod(sceneTex, uvC - vec2(0.0, px.y), 0.0).rgb);
        disp += clamp((lc * 4.0 - ln) * uLens.w, -0.08, 0.08);

        // highlights roll off like a sensor's instead of clipping per channel, then gentle contrast
        disp = softClip(max(disp, vec3(0.0)));
        disp = mix(disp, disp * disp * (3.0 - 2.0 * disp), uLook.z);

        // lens falloff
        disp *= mix(1.0, 1.0 - uLens.z, smoothstep(0.1, 1.45, r2));

        // sensor noise on a 1080p grid, stronger in the shadows
        vec2 cell = floor(gl_FragCoord.xy * uLook.y);
        float fr = uTiming.z;
        float n1 = hash12(cell + fr * 7.31) + hash12(cell * 1.37 + fr * 3.17) - 1.0;
        float n2 = hash12(cell * 0.71 + fr * 5.53) - 0.5;
        float n3 = hash12(cell * 1.93 + fr * 2.29) - 0.5;
        float lum = luma(disp);
        float amp = uLook.x * (1.25 - 0.85 * lum);
        disp += vec3(n1) * amp + vec3(n2, -0.5 * (n2 + n3), n3) * amp * 0.45;

        gl_FragColor = vec4(clamp(disp, 0.0, 1.0) * uLook.w, 1.0);
    }
`;

const wgslVS = /* wgsl */ `
    attribute aPosition: vec2f;
    varying ndc: vec2f;
    @vertex fn vertexMain(input: VertexInput) -> VertexOutput {
        var output: VertexOutput;
        output.position = vec4f(input.aPosition, 0.0, 1.0);
        output.ndc = input.aPosition;
        return output;
    }
`;

const wgslFS = /* wgsl */ `
    var sceneTex: texture_2d<f32>;
    var sceneTexSampler: sampler;
    uniform uM0: mat4x4f;
    uniform uM2: mat4x4f;
    uniform uTan: vec4f;
    uniform uTiming: vec4f;
    uniform uFloor: vec4f;
    uniform uWallL: vec4f;
    uniform uWallR: vec4f;
    uniform uCeil: vec4f;
    uniform uLens: vec4f;
    uniform uLook: vec4f;
    uniform uGlow: vec4f;
    uniform uRes: vec4f;
    varying ndc: vec2f;

    fn hash12(p: vec2f) -> f32 {
        var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
        p3 = p3 + dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
    }
    fn toLin(c: vec3f) -> vec3f { return pow(max(c, vec3f(0.0)), vec3f(2.2)); }
    fn toSrgb(c: vec3f) -> vec3f { return pow(max(c, vec3f(0.0)), vec3f(1.0 / 2.2)); }

    fn hitPlane(pl: vec4f, o: vec3f, v: vec3f, tMin: f32) -> f32 {
        let nv = dot(pl.xyz, v);
        if (nv >= -1e-4) { return tMin; }
        let t = -(dot(pl.xyz, o) + pl.w) / nv;
        if (t > 0.0) { return min(tMin, t); }
        return tMin;
    }
    fn projectUv(P: vec3f) -> vec2f {
        let z = max(-P.z, 1e-3);
        let n = (P.xy / z) / uniform.uTan.zw;
        return getImageEffectUV(n * 0.5 + 0.5);
    }
    fn originAt(f: f32) -> vec3f {
        if (f < 0.0) { return -f * uniform.uM0[3].xyz; }
        return f * uniform.uM2[3].xyz;
    }
    fn dirAt(d: vec3f, f: f32) -> vec3f {
        if (f < 0.0) { return d - f * ((uniform.uM0 * vec4f(d, 0.0)).xyz - d); }
        return d + f * ((uniform.uM2 * vec4f(d, 0.0)).xyz - d);
    }
    fn luma(c: vec3f) -> f32 { return dot(c, vec3f(0.2126, 0.7152, 0.0722)); }
    fn softClip(c: vec3f) -> vec3f {
        let k = vec3f(0.9) + 0.1 * (vec3f(1.0) - exp(-(max(c - vec3f(0.9), vec3f(0.0))) / 0.1));
        let s = mix(c, k, step(vec3f(0.9), c));
        let over = max(max(c.r, c.g), c.b);
        return mix(s, vec3f(1.0), smoothstep(1.2, 3.0, over) * 0.6);
    }
    fn tap(uv: vec2f, lod: f32) -> vec3f { return textureSampleLevel(sceneTex, sceneTexSampler, uv, lod).rgb; }

    @fragment fn fragmentMain(input: FragmentInput) -> FragmentOutput {
        var output: FragmentOutput;
        let n = ndc;
        let q = n * uniform.uTan.xy;
        let rho = vec2f(n.x * uniform.uTan.x / uniform.uTan.y, n.y) * uniform.uGlow.w;
        let r2 = dot(rho, rho);
        let lens = uniform.uLens;
        let dR = vec3f(q * (1.0 + (lens.x + lens.y) * r2), -1.0);
        let dG = vec3f(q * (1.0 + lens.x * r2), -1.0);
        let dB = vec3f(q * (1.0 + (lens.x - lens.y) * r2), -1.0);

        let timing = uniform.uTiming;
        let rowF = (0.5 - n.y * 0.5 - 0.5) * timing.x;
        let jitter = hash12(pcPosition.xy + fract(timing.z * 0.6180339) * 113.0);
        let taps = i32(timing.w);
        var acc = vec3f(0.0);
        var uvC = vec2f(0.0);
        for (var i = 0; i < 24; i += 1) {
            if (i >= taps) { break; }
            let s = (f32(i) + jitter) / f32(taps) - 0.5;
            let f = clamp(rowF + s * timing.y, -1.0, 1.0);
            let o = originAt(f);
            let vG = dirAt(dG, f);
            var t = 120.0;
            t = hitPlane(uniform.uFloor, o, vG, t);
            t = hitPlane(uniform.uWallL, o, vG, t);
            t = hitPlane(uniform.uWallR, o, vG, t);
            t = hitPlane(uniform.uCeil, o, vG, t);
            let uvG = projectUv(o + vG * t);
            if (lens.y == 0.0) {
                acc += toLin(tap(uvG, 0.0));
            } else {
                let uvR = projectUv(o + dirAt(dR, f) * t);
                let uvB = projectUv(o + dirAt(dB, f) * t);
                acc.x += toLin(tap(uvR, 0.0)).x;
                acc.y += toLin(tap(uvG, 0.0)).y;
                acc.z += toLin(tap(uvB, 0.0)).z;
            }
            uvC += uvG;
        }
        var col = acc / f32(taps);
        uvC = uvC / f32(taps);

        let glow = uniform.uGlow;
        let g = toLin(tap(uvC, glow.z));
        col += max(g - vec3f(glow.y), vec3f(0.0)) * glow.x;

        var disp = toSrgb(col);

        let px = uniform.uRes.zw;
        let lc = luma(tap(uvC, 0.0));
        let ln = luma(tap(uvC + vec2f(px.x, 0.0), 0.0)) + luma(tap(uvC - vec2f(px.x, 0.0), 0.0)) +
                 luma(tap(uvC + vec2f(0.0, px.y), 0.0)) + luma(tap(uvC - vec2f(0.0, px.y), 0.0));
        disp += vec3f(clamp((lc * 4.0 - ln) * lens.w, -0.08, 0.08));

        let look = uniform.uLook;
        disp = softClip(max(disp, vec3f(0.0)));
        disp = mix(disp, disp * disp * (3.0 - 2.0 * disp), look.z);
        disp *= mix(1.0, 1.0 - lens.z, smoothstep(0.1, 1.45, r2));

        let cell = floor(pcPosition.xy * look.y);
        let fr = timing.z;
        let n1 = hash12(cell + fr * 7.31) + hash12(cell * 1.37 + fr * 3.17) - 1.0;
        let n2 = hash12(cell * 0.71 + fr * 5.53) - 0.5;
        let n3 = hash12(cell * 1.93 + fr * 2.29) - 0.5;
        let lum = luma(disp);
        let amp = look.x * (1.25 - 0.85 * lum);
        disp += vec3f(n1) * amp + vec3f(n2, -0.5 * (n2 + n3), n3) * amp * 0.45;

        output.color = vec4f(clamp(disp, vec3f(0.0), vec3f(1.0)) * look.w, 1.0);
        return output;
    }
`;

export class FilmPass extends RenderPassShaderQuad {
    constructor(device, sourceTexture) {
        super(device);
        this.sourceTexture = sourceTexture;
        this.shader = ShaderUtils.createShader(device, {
            uniqueName: 'ArtilleryFilmPass',
            attributes: { aPosition: SEMANTIC_POSITION },
            vertexGLSL: glslVS,
            fragmentGLSL: glslFS,
            vertexWGSL: wgslVS,
            fragmentWGSL: wgslFS
        });
        const s = device.scope;
        this.ids = {};
        for (const n of ['sceneTex', 'uM0', 'uM2', 'uTan', 'uTiming', 'uFloor', 'uWallL', 'uWallR', 'uCeil', 'uLens', 'uLook', 'uGlow', 'uRes']) {
            this.ids[n] = s.resolve(n);
        }
        // values written by the app every frame
        this.M0 = new Float32Array(16);
        this.M2 = new Float32Array(16);
        this.tan = new Float32Array(4);
        this.timing = new Float32Array(4);
        this.floor = new Float32Array(4);
        this.wallL = new Float32Array(4);
        this.wallR = new Float32Array(4);
        this.ceil = new Float32Array(4);
        this.lens = new Float32Array([0.03, 0.0025, 0.22, 0.17]);
        this.look = new Float32Array([0.026, 1, 0.12, 1]);
        this.glow = new Float32Array([0.06, 0.55, 5, 0.5625]);
        this.res = new Float32Array(4);
    }

    execute() {
        const t = this.sourceTexture;
        this.res[0] = t.width; this.res[1] = t.height; this.res[2] = 1 / t.width; this.res[3] = 1 / t.height;
        const id = this.ids;
        id.sceneTex.setValue(t);
        id.uM0.setValue(this.M0);
        id.uM2.setValue(this.M2);
        id.uTan.setValue(this.tan);
        id.uTiming.setValue(this.timing);
        id.uFloor.setValue(this.floor);
        id.uWallL.setValue(this.wallL);
        id.uWallR.setValue(this.wallR);
        id.uCeil.setValue(this.ceil);
        id.uLens.setValue(this.lens);
        id.uLook.setValue(this.look);
        id.uGlow.setValue(this.glow);
        id.uRes.setValue(this.res);
        super.execute();
    }
}
