// The soundtrack the phone would have recorded: the walker's own footsteps (trainers on stone
// paving), the acoustics of a narrow passage, and the city all around - a continuous, slowly
// shifting bed of distant traffic and life, with faint distant sounds rising out of it and
// sinking back. Everything is scheduled on the AudioContext clock from the walk's timeline, and
// while it plays that clock drives the video (as a video player syncs pictures to sound).

const dbToGain = db => Math.pow(10, db / 20);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// deterministic random numbers: the same soundtrack on every play, whatever the start point
function prng(seed) {
    return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

// smooth 1D value noise in [-1, 1]
function valueNoise(seed) {
    const r = prng(seed), v = Array.from({ length: 256 }, () => r() * 2 - 1);
    return (x) => {
        const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
        return v[i & 255] + (v[(i + 1) & 255] - v[i & 255]) * u;
    };
}

// how enclosed the walker is (1 inside the passage, 0 out on the open street), by world z
function enclosure(z) {
    return smooth(-28.5, -25.5, z) * (1 - smooth(23.0, 26.5, z));
}

// mix levels (dB): the city bed sits well under the footsteps
const MAKEUP_DB = 3;
const STEPS_DB = -4;
const CITY_DB = -6;

// the continuous city: looped layers, each drifting in level on its own slow cycle (dB)
const BEDS = [
    { name: 'bed-traffic', db: -19, drift: 4.5, period: 17, rate: 0.985 },
    { name: 'bed-murmur', db: -22, drift: 4, period: 23, rate: 1 },
    { name: 'bed-birds', db: -25, drift: 5, period: 13, rate: 1.01 },
    { name: 'bed-distant', db: -18, drift: 3, period: 29, rate: 1 }
];

// faint distant sounds drawn at random into the bed: relative weight, level range (dB), how many
// at most, and how much of a longer one to play
const SCATTER = [
    { name: 'car', w: 3, db: [-40, -33], max: 6 },
    { name: 'van', w: 2, db: [-41, -35], max: 3 },
    { name: 'scooter', w: 2, db: [-42, -35], max: 3 },
    { name: 'bus', w: 1.5, db: [-42, -36], max: 2 },
    { name: 'voices', w: 2.5, db: [-41, -34], max: 5 },
    { name: 'passersby', w: 2, db: [-41, -35], max: 3 },
    { name: 'laugh', w: 1, db: [-43, -37], max: 2 },
    { name: 'pigeons', w: 1.5, db: [-40, -33], max: 3 },
    { name: 'sparrows', w: 1.5, db: [-41, -34], max: 3 },
    { name: 'gull', w: 0.8, db: [-44, -38], max: 2 },
    { name: 'horn', w: 0.8, db: [-45, -39], max: 2 },
    { name: 'dog', w: 0.5, db: [-45, -40], max: 1 },
    { name: 'trolley', w: 1, db: [-43, -37], max: 2 },
    { name: 'shutter', w: 0.6, db: [-44, -38], max: 1 },
    { name: 'siren', w: 0.6, db: [-46, -41], max: 1 }
];

// a few sounds placed by what the walker passes (video seconds)
const PLACED = [
    { name: 'pigeons', t: 0.6, db: -28, pan: -0.35, send: 0.15, lp: 7000 },
    { name: 'door', t: 33.4, db: -25, pan: 0.4, send: 0.6, lp: 6500 }
];

export class Soundtrack {
    constructor(walk, base = './audio/') {
        this.walk = walk;
        this.base = base;
        this.ctx = null;
        this.ready = false;
        this.running = false;
        this.muted = false;
        this.sources = [];
        this.t0 = 0;           // ctx time of video time 0
        this.footfalls = walk.footfalls();
    }

    // create the context (suspended until a user gesture) and decode everything
    async load() {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const ctx = this.ctx = new AC();
        const fetchBuf = async (name) => {
            const res = await fetch(this.base + name);
            if (!res.ok) throw new Error(`${name}: ${res.status}`);
            return ctx.decodeAudioData(await res.arrayBuffer());
        };
        const [steps, stepsMeta] = await Promise.all([
            fetchBuf('steps.mp3'),
            fetch(this.base + 'steps.json').then(r => r.json())
        ]);
        this.steps = steps;
        this.stepSlices = this._locateSteps(steps, stepsMeta.steps);
        const names = [...new Set([...SCATTER, ...PLACED].map(e => e.name)), 'fx-burn', 'fx-restore'];
        this.buffers = {};
        this.beds = {};
        const optional = await Promise.allSettled([
            ...names.map(async (n) => { this.buffers[n] = await fetchBuf(`${n}.mp3`); }),
            ...BEDS.map(async (b) => { this.beds[b.name] = this._loop(await fetchBuf(`${b.name}.mp3`), 1.5); })
        ]);
        for (const result of optional) if (result.status === 'rejected') console.warn('Optional sound unavailable:', result.reason);
        this._buildGraph();
        this.scatter = this._planScatter(this.walk.duration);
        this.ready = true;
    }

    // the decoder may shift the sprite by its padding: find each step's real attack near its slot
    _locateSteps(buf, slices) {
        const x = buf.getChannelData(0), sr = buf.sampleRate;
        return slices.map(([start, dur]) => {
            const a = Math.max(0, Math.floor((start - 0.06) * sr)), b = Math.min(x.length, Math.floor((start + 0.12) * sr));
            let pk = 0;
            for (let i = a; i < b; i++) pk = Math.max(pk, Math.abs(x[i]));
            let on = a;
            for (let i = a; i < b; i++) if (Math.abs(x[i]) > pk * 0.06) { on = i; break; }
            return { start: Math.max(0, on / sr - 0.002), dur };
        });
    }

    // a seamless loop: the last `xf` seconds crossfade (equal power) into the start
    _loop(buf, xf) {
        const sr = buf.sampleRate, n = buf.length, x = Math.min(Math.floor(xf * sr), n >> 2);
        const out = this.ctx.createBuffer(buf.numberOfChannels, n - x, sr);
        for (let c = 0; c < buf.numberOfChannels; c++) {
            const src = buf.getChannelData(c), dst = out.getChannelData(c);
            dst.set(src.subarray(0, n - x));
            for (let i = 0; i < x; i++) {
                const w = i / x;
                dst[i] = src[i] * Math.sin(w * Math.PI / 2) + src[n - x + i] * Math.cos(w * Math.PI / 2);
            }
        }
        return out;
    }

    // where the faint distant sounds fall: overlapping, irregular, never the same one twice running
    _planScatter(duration) {
        const r = prng(90210);
        const count = {};
        const out = [];
        let t = 0.8 + r() * 1.5, last = '';
        while (t < duration - 1) {
            const pool = SCATTER.filter(s => s.name !== last && (count[s.name] ?? 0) < s.max);
            const total = pool.reduce((a, s) => a + s.w, 0);
            let pick = r() * total, s = pool[0];
            for (const p of pool) { pick -= p.w; if (pick <= 0) { s = p; break; } }
            const buf = this.buffers[s.name];
            if (buf) {
                // play all of a short sound, or a stretch of a longer one
                const len = Math.min(buf.duration, 1.6 + r() * 3.4);
                const offset = (buf.duration - len) * r();
                out.push({
                    name: s.name, t, len, offset,
                    db: s.db[0] + (s.db[1] - s.db[0]) * r(),
                    pan: (r() * 2 - 1) * 0.8,
                    lp: 1400 + r() * r() * 5000,          // most of them far away and dull
                    fadeIn: 0.25 + r() * 0.7,
                    fadeOut: 0.5 + r() * 0.9,
                    send: 0.2 + r() * 0.45
                });
                count[s.name] = (count[s.name] ?? 0) + 1;
                last = s.name;
            }
            t += 1.1 + r() * 2.6;
        }
        return out;
    }

    _buildGraph() {
        const ctx = this.ctx;
        // phone microphone: no real low end, automatic gain riding the levels, a limiter
        this.out = ctx.createGain();
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 95; hp.Q.value = 0.6;
        const shelf = ctx.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 9000; shelf.gain.value = -3;
        // (DynamicsCompressorNode adds its own makeup gain, ~+7 dB here and ~+2 dB for the limiter)
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -20; comp.knee.value = 10; comp.ratio.value = 2.5; comp.attack.value = 0.004; comp.release.value = 0.22;
        const makeup = ctx.createGain(); makeup.gain.value = dbToGain(MAKEUP_DB);
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.002; limiter.release.value = 0.1;
        this.master = ctx.createGain();
        this.master.gain.value = 0;
        this.out.connect(hp); hp.connect(shelf); shelf.connect(comp); comp.connect(makeup); makeup.connect(limiter);
        limiter.connect(this.master); this.master.connect(ctx.destination);
        // effect sounds join after the master fade, so they still play while the video is paused
        this.fxBus = ctx.createGain();
        const fxHp = ctx.createBiquadFilter(); fxHp.type = 'highpass'; fxHp.frequency.value = 70;
        const fxLimit = ctx.createDynamicsCompressor();
        fxLimit.threshold.value = -6; fxLimit.knee.value = 0; fxLimit.ratio.value = 20; fxLimit.attack.value = 0.002; fxLimit.release.value = 0.15;
        this.fxBus.connect(fxHp); fxHp.connect(fxLimit); fxLimit.connect(ctx.destination);

        // the passage: flutter between the walls and a short stone tail; its level follows the walker
        this.reverb = ctx.createConvolver();
        this.reverb.buffer = this._alleyImpulse();
        this.reverbGain = ctx.createGain();
        this.reverbGain.gain.value = 0;
        this.reverb.connect(this.reverbGain); this.reverbGain.connect(this.out);

        // footsteps bus
        this.stepsBus = ctx.createGain();
        this.stepsBus.gain.value = dbToGain(STEPS_DB);
        this.stepsBus.connect(this.out);
        this.stepsSend = ctx.createGain();
        this.stepsSend.gain.value = 0.5;
        this.stepsBus.connect(this.stepsSend); this.stepsSend.connect(this.reverb);

        // the city bus: the bed layers and the distant sounds. Between the buildings it is quieter
        // and duller (the walls block the direct sound), and a little of it echoes in the passage
        this.cityIn = ctx.createGain();
        this.cityIn.gain.value = dbToGain(CITY_DB);
        this.cityFilter = ctx.createBiquadFilter(); this.cityFilter.type = 'lowpass'; this.cityFilter.Q.value = 0.4;
        this.cityGain = ctx.createGain(); this.cityGain.gain.value = 1;
        this.cityIn.connect(this.cityFilter); this.cityFilter.connect(this.cityGain); this.cityGain.connect(this.out);
        this.citySend = ctx.createGain(); this.citySend.gain.value = 0.12;
        this.cityGain.connect(this.citySend); this.citySend.connect(this.reverb);
    }

    _alleyImpulse() {
        const ctx = this.ctx, sr = ctx.sampleRate, len = Math.floor(sr * 1.3);
        const ir = ctx.createBuffer(2, len, sr);
        const rnd = prng(12345);
        for (let c = 0; c < 2; c++) {
            const d = ir.getChannelData(c);
            // flutter echo between walls ~3 m apart (8.7 ms round trip), alternating sides
            for (let k = 1; k <= 14; k++) {
                const i = Math.floor((0.0045 + k * 0.0087 + (c ? 0.0006 : 0)) * sr);
                if (i < len) d[i] += (k % 2 === c ? 0.55 : 0.4) * Math.pow(0.72, k);
            }
            // diffuse tail, losing its highs as it decays
            let lp = 0;
            for (let i = Math.floor(0.012 * sr); i < len; i++) {
                const t = i / sr;
                const a = Math.min(0.92, 0.25 + t * 1.6);
                lp = lp * a + (rnd() * 2 - 1) * (1 - a);
                d[i] += lp * 0.9 * Math.exp(-t / 0.16) * smooth(0.01, 0.03, t);
            }
        }
        return ir;
    }

    // video time now, from the audio clock: what is being heard, nudged by about the frame's own
    // trip to the screen
    get time() {
        return this.ctx.currentTime - this.t0 - (this.ctx.outputLatency || 0) + 0.02;
    }

    get healthy() {
        return this.running && this.ctx?.state === 'running';
    }

    /**
     * Start the soundtrack at video time `t`. Resolves true once the clock is running, false when
     * audio isn't available (no gesture yet, or no Web Audio) - the video then keeps its own clock.
     */
    async start(t, duration, canStart = () => true) {
        if (!this.ready) return false;
        const ctx = this.ctx;
        if (ctx.state !== 'running') {
            try {
                await Promise.race([ctx.resume(), new Promise(r => setTimeout(r, 400))]);
            } catch { /* ignore */ }
            if (ctx.state !== 'running') return false;
        }
        if (!canStart()) return false;
        this.stop(true);
        const now = ctx.currentTime + 0.05;
        this.t0 = now - t;
        const at = vt => Math.max(now, this.t0 + vt);
        const end = this.t0 + duration;

        // master: fade in, fade out with the picture
        this.fade = { start: Math.max(now + 0.4, end - 1.4), end };
        const g = this.master.gain;
        g.cancelScheduledValues(0);
        g.setValueAtTime(0, now);
        g.linearRampToValueAtTime(this.muted ? 0 : 1, now + 0.35);
        g.setValueAtTime(this.muted ? 0 : 1, this.fade.start);
        g.linearRampToValueAtTime(0, end);

        // place-dependent: the passage's echo, and how much of the city gets in
        const rg = this.reverbGain.gain, cg = this.cityGain.gain, cf = this.cityFilter.frequency;
        for (const p of [rg, cg, cf]) p.cancelScheduledValues(0);
        for (let vt = Math.max(0, t), first = true; vt <= duration + 0.5; vt += 0.5, first = false) {
            const e = enclosure(this.walk.zAt(vt));
            const set = first ? 'setValueAtTime' : 'linearRampToValueAtTime';
            rg[set](0.12 + 0.5 * e, at(vt));
            cg[set](dbToGain(-6 * e), at(vt));
            cf[set](7500 - 5300 * e, at(vt));
        }

        // the bed: every layer runs continuously, drifting in level on its own slow cycle
        BEDS.forEach((b, li) => {
            const buf = this.beds[b.name];
            if (!buf) return;
            const src = ctx.createBufferSource();
            src.buffer = buf; src.loop = true; src.playbackRate.value = b.rate;
            const gain = ctx.createGain();
            const nz = valueNoise(500 + li * 17);
            const p = gain.gain;
            for (let vt = Math.max(0, t), first = true; vt <= duration + 1; vt += 0.5, first = false) {
                const db = b.db + b.drift * nz(vt / b.period * 3 + li * 7.3);
                p[first ? 'setValueAtTime' : 'linearRampToValueAtTime'](dbToGain(db), at(vt));
            }
            src.connect(gain); gain.connect(this.cityIn);
            src.start(now, (t * b.rate + li * 5.7) % buf.duration);
            this.sources.push(src);
        });

        // faint distant sounds, rising out of the bed and sinking back
        for (const e of [...this.scatter, ...PLACED.map(p => ({ ...p, len: this.buffers[p.name]?.duration ?? 0, offset: 0, fadeIn: 0.05, fadeOut: 0.3 }))]) {
            const buf = this.buffers[e.name];
            if (!buf || e.t + e.len < t || e.t > duration) continue;
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = e.lp; lp.Q.value = 0.5;
            const gain = ctx.createGain();
            const peak = dbToGain(e.db);
            const s0 = this.t0 + e.t, s1 = s0 + e.len;
            gain.gain.setValueAtTime(0, at(e.t));
            gain.gain.linearRampToValueAtTime(peak, Math.max(at(e.t) + 0.01, s0 + e.fadeIn));
            gain.gain.setValueAtTime(peak, Math.max(at(e.t) + 0.02, s1 - e.fadeOut));
            gain.gain.linearRampToValueAtTime(0, Math.max(at(e.t) + 0.03, s1));
            const pan = ctx.createStereoPanner(); pan.pan.value = e.pan;
            const send = ctx.createGain(); send.gain.value = e.send;
            src.connect(lp); lp.connect(gain); gain.connect(pan); pan.connect(this.cityIn); pan.connect(send); send.connect(this.reverb);
            const skip = Math.max(0, t - e.t);
            src.start(at(e.t), e.offset + skip, Math.max(0.01, e.len - skip));
            this.sources.push(src);
        }

        // footsteps
        let prev = -1;
        const rnd = prng(4242);
        const slices = this.stepSlices;
        for (const f of this.footfalls) {
            // draw everything first so the choices don't depend on the start point
            let k = Math.floor(rnd() * slices.length);
            if (k === prev) k = (k + 1) % slices.length;
            prev = k;
            const jitterDb = (rnd() - 0.5) * 3;
            const rate = 0.96 + rnd() * 0.08;
            if (f.t < t) continue;
            const pace = clamp(f.speed / 1.2, 0, 1);
            const db = -1.5 + (f.foot ? 1.2 : -1.2) + jitterDb - 7 * (1 - pace);
            const src = ctx.createBufferSource();
            src.buffer = this.steps;
            src.playbackRate.value = rate;
            const gain = ctx.createGain(); gain.gain.value = dbToGain(db);
            const pan = ctx.createStereoPanner(); pan.pan.value = f.foot ? 0.07 : -0.07;
            src.connect(gain); gain.connect(pan); pan.connect(this.stepsBus);
            src.start(at(f.t), slices[k].start, slices[k].dur);
            this.sources.push(src);
        }
        this.running = true;
        return true;
    }

    /**
     * Plays an effect sound now, over whatever else is playing (also while paused). Effect sounds
     * are not part of the recorded scene: no distance filtering, a little of the passage's echo.
     */
    playFx(name, db = -10) {
        const buf = this.buffers?.[name];
        if (!buf || !this.ready || !this.fxBus || !this.ctx || this.muted) return;
        const ctx = this.ctx;
        if (ctx.state !== 'running') ctx.resume().catch(() => {});
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const gain = ctx.createGain(); gain.gain.value = dbToGain(db);
        const send = ctx.createGain(); send.gain.value = 0.25;
        src.connect(gain); gain.connect(this.fxBus); gain.connect(send); send.connect(this.reverb);
        // the master is faded out while paused: effects use their own path to the output
        src.start(ctx.currentTime + 0.01);
    }

    stop(immediate = false) {
        if (!this.ctx || !this.master) return;
        const now = this.ctx.currentTime;
        const g = this.master.gain;
        g.cancelScheduledValues(0);
        g.setValueAtTime(g.value, now);
        g.linearRampToValueAtTime(0, now + (immediate ? 0.005 : 0.04));
        const stopAt = now + (immediate ? 0.006 : 0.05);
        for (const s of this.sources) { try { s.stop(stopAt); } catch { /* already stopped */ } }
        this.sources = [];
        this.running = false;
    }

    setMuted(m) {
        this.muted = m;
        if (!this.ctx || !this.running) return;
        const now = this.ctx.currentTime;
        const g = this.master.gain;
        g.cancelScheduledValues(now);
        g.setValueAtTime(g.value, now);
        if (m) { g.linearRampToValueAtTime(0, now + 0.08); return; }
        // unmuted: back up, and keep the fade-out with the picture
        const { start, end } = this.fade;
        if (now >= end) return;
        const level = now < start ? 1 : (end - now) / (end - start);
        g.linearRampToValueAtTime(level, now + 0.08);
        if (now + 0.08 < start) g.setValueAtTime(1, start);
        g.linearRampToValueAtTime(0, end);
    }
}
