// Deterministic smooth 1D noise (value noise with quintic interpolation) for hand shake.

function mulberry32(seed) {
    return () => {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

export class Noise1D {
    constructor(seed, size = 1024) {
        const rnd = mulberry32(seed);
        this.size = size;
        this.v = new Float32Array(size);
        for (let i = 0; i < size; i++) this.v[i] = rnd() * 2 - 1;
    }

    // value noise in [-1, 1]
    at(x) {
        const i = Math.floor(x);
        const f = x - i;
        const u = f * f * f * (f * (f * 6 - 15) + 10);
        const n = this.size;
        const a = this.v[((i % n) + n) % n];
        const b = this.v[(((i + 1) % n) + n) % n];
        return a + (b - a) * u;
    }

    // fractal sum, normalised to roughly [-1, 1]
    fbm(x, octaves = 3) {
        let sum = 0, amp = 1, norm = 0, fx = x;
        for (let o = 0; o < octaves; o++) {
            sum += amp * this.at(fx + o * 31.7);
            norm += amp;
            amp *= 0.5;
            fx *= 2.03;
        }
        return sum / norm;
    }
}
