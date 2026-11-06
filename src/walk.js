import { Quat, Vec3 } from 'playcanvas';
import { Noise1D } from './noise.js';

// A person walking down Artillery Passage, filming at eye level. Everything is a pure function of
// the time t, so the film pass can ask for the pose at any instant inside the exposure.
//
// Scene data is measured from the splat (PLY coordinates, y down, see the scratch analysis): the
// splat entity is turned 180 degrees about Z, so world X = -x, Y = -y, Z = z.

const DEG = Math.PI / 180;
export const plyToWorld = (x, y, z) => new Vec3(-x, -y, z);

// floor height (PLY y, down) along z, measured at walking height every metre
const FLOOR = [
    [30, -0.97], [29, -0.96], [28, -0.99], [27, -1], [26, -1.02], [25, -1.05], [24, -1.07], [23, -1.1], [22, -1.08], [21, -1.09],
    [20, -1.09], [19, -1.09], [18, -1.09], [17, -1.08], [16, -1.08], [15, -1.09], [14, -1.09], [13, -1.08], [12, -1.07], [11, -1.09],
    [10, -1.09], [9, -1.09], [8, -1.09], [7, -1.09], [6, -1.08], [5, -1.1], [4, -1.09], [3, -1.11], [2, -1.11], [1, -1.1], [0, -1.11],
    [-1, -1.11], [-2, -1.11], [-3, -1.11], [-4, -1.11], [-5, -1.1], [-6, -1.08], [-7, -1.06], [-8, -1.04], [-9, -1.01], [-10, -0.99],
    [-11, -0.99], [-12, -0.97], [-13, -0.94], [-14, -0.92], [-15, -0.95], [-16, -0.88], [-17, -0.87], [-18, -0.86], [-19, -0.83],
    [-20, -0.81], [-21, -0.78], [-22, -0.77], [-23, -0.75], [-24, -0.74], [-25, -0.73], [-26, -0.7], [-27, -0.71], [-28, -0.74],
    [-29, -0.77], [-30, -0.8], [-31, -0.82], [-32, -0.83], [-33, -0.84], [-34, -0.85]
].sort((a, b) => a[0] - b[0]);

// passage walls (PLY x of the two faces) along z, for the motion-blur depth proxy
const WALLS = [
    [-36, -2.0, 7.0], [-29, 0.0, 6.0], [-27, 1.6, 4.6], [-22, 1.55, 4.25], [-16, 1.3, 4.05], [-12, 1.15, 3.95], [-6, 1.05, 3.9],
    [0, 0.9, 3.85], [6, 0.8, 3.85], [12, 0.6, 3.85], [18, 0.45, 3.65], [24, 0.55, 3.45], [27, -1.0, 3.3], [32, -3.0, 3.2]
];

function interpTable(table, z, col = 1) {
    if (z <= table[0][0]) return table[0][col];
    for (let i = 1; i < table.length; i++) {
        if (z <= table[i][0]) {
            const a = table[i - 1], b = table[i];
            const t = (z - a[0]) / (b[0] - a[0]);
            return a[col] + (b[col] - a[col]) * t;
        }
    }
    return table[table.length - 1][col];
}

// world-space floor height, smoothed over ~1.5 m so the scan's bumps don't reach the camera
function floorY(z) {
    let sum = 0, wsum = 0;
    for (let k = -4; k <= 4; k++) {
        const w = Math.exp(-(k * k) / 8);
        sum += -interpTable(FLOOR, z + k * 0.35) * w;
        wsum += w;
    }
    return sum / wsum;
}

export function wallsAt(z) {
    return { a: interpTable(WALLS, z, 1), b: interpTable(WALLS, z, 2) };
}

const smooth = t => t * t * (3 - 2 * t);
// deterministic random numbers in [0, 1)
const prng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
// steps per second at a walking speed (m/s): ~1.8 at 1.2 m/s, short quick steps when slow
const cadence = v => 1.3 + 0.41 * Math.max(0, v);
const minJerk = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (10 + t * (-15 + 6 * t)));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));

// centripetal Catmull-Rom through 2D points, sampled densely, with arc length
function buildPath(points, step = 0.02) {
    const P = [points[0].map((v, i) => v * 2 - points[1][i]), ...points, points[points.length - 1].map((v, i) => v * 2 - points[points.length - 2][i])];
    const out = [];
    for (let i = 1; i < P.length - 2; i++) {
        const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
        const d = (a, b) => Math.max(1e-4, Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5));
        const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
        const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
        const n = Math.max(2, Math.ceil(segLen / step));
        for (let k = 0; k < n; k++) {
            const t = t1 + (t2 - t1) * (k / n);
            const L = (pa, pb, ta, tb) => [0, 1].map(j => ((tb - t) * pa[j] + (t - ta) * pb[j]) / (tb - ta));
            const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
            const B1 = [0, 1].map(j => ((t2 - t) * A1[j] + (t - t0) * A2[j]) / (t2 - t0));
            const B2 = [0, 1].map(j => ((t3 - t) * A2[j] + (t - t1) * A3[j]) / (t3 - t1));
            out.push([0, 1].map(j => ((t2 - t) * B1[j] + (t - t1) * B2[j]) / (t2 - t1)));
        }
    }
    out.push(points[points.length - 1].slice());
    const s = [0];
    for (let i = 1; i < out.length; i++) s.push(s[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
    return { pts: out, s, length: s[s.length - 1] };
}

function pathAt(path, s, out) {
    const { pts, s: S } = path;
    if (s <= 0) { out[0] = pts[0][0]; out[1] = pts[0][1]; return out; }
    if (s >= path.length) {
        // continue straight past the end, for look-ahead targets
        const a = pts[pts.length - 2], b = pts[pts.length - 1];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const e = s - path.length;
        out[0] = b[0] + (b[0] - a[0]) / l * e; out[1] = b[1] + (b[1] - a[1]) / l * e;
        return out;
    }
    let lo = 0, hi = S.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
    const t = (s - S[lo]) / (S[hi] - S[lo] || 1);
    out[0] = pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t;
    out[1] = pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t;
    return out;
}

export class Walk {
    /**
     * @param {object} cfg
     * @param {number[][]} cfg.waypoints - [x, z] in PLY coordinates, in walking order
     * @param {object[]} cfg.looks - attention events: { at: metres along the path (or time if `t`),
     * target: [x, y, z] PLY point, or yaw/pitch offsets in degrees, in, hold, out (seconds) }
     */
    constructor(cfg) {
        this.cfg = cfg = Object.assign({
            eyeHeight: 1.6,
            speed: 1.22,
            idleStart: 2.4,
            holdEnd: 3.6,
            accelTime: 1.7,
            stopDistance: 2.0,
            lookAhead: 5.0,
            seed: 7
        }, cfg);
        // world XZ path
        this.path = buildPath(cfg.waypoints.map(([x, z]) => [-x, z]));
        this.noise = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => new Noise1D(cfg.seed * 97 + k));
        this._simulate();
    }

    // speed profile -> distance s(t) and gait phase, tabulated at 240 Hz
    _simulate() {
        const cfg = this.cfg;
        const L = this.path.length;
        const dt = 1 / 240;
        const looks = this.cfg.looks || [];

        const run = (lookTimes) => {
            const T = [], S = [], V = [], PH = [];
            let t = 0, s = 0, v = 0, ph = 0, phase = 'idle', vEntry = 0;
            let tWalk = cfg.idleStart;
            let done = false, tStop = Infinity;
            while (t < 600) {
                // attention slows the walker a little
                let slow = 0;
                if (lookTimes) for (const lk of lookTimes) slow = Math.max(slow, lk.weight(t) * (lk.slow ?? 0.12));
                const drift = 1 + 0.035 * this.noise[8].fbm(t * 0.13, 2);
                const vCruise = cfg.speed * drift * (1 - slow);
                if (phase === 'idle') {
                    v = 0;
                    if (t >= tWalk) phase = 'accel';
                } else if (phase === 'accel') {
                    const k = clamp((t - tWalk) / cfg.accelTime, 0, 1);
                    v = vCruise * smooth(k);
                    if (k >= 1) phase = 'cruise';
                }
                if (phase === 'cruise') v = vCruise;
                if ((phase === 'cruise' || phase === 'accel') && L - s <= cfg.stopDistance) { phase = 'stop'; vEntry = v; }
                if (phase === 'stop') {
                    const rem = L - s;
                    v = Math.max(0.03, vEntry * Math.pow(clamp(rem / cfg.stopDistance, 0, 1), 0.62));
                    if (rem <= 0.002) { v = 0; s = L; phase = 'end'; tStop = t; }
                }
                if (phase === 'end') { v = 0; if (t > tStop + cfg.holdEnd) done = true; }
                T.push(t); S.push(s); V.push(v); PH.push(ph);
                if (done) break;
                s = Math.min(L, s + v * dt);
                // cadence rises with speed: ~1.8 steps/s at 1.25 m/s
                if (v > 0.02) ph += cadence(v) * (1 + 0.03 * this.noise[7].fbm(t * 0.45, 2)) * dt;
                else ph += (Math.ceil(ph) - ph) > 0.02 ? Math.min(Math.ceil(ph) - ph, 1.6 * dt) : 0; // finish the last step
                t += dt;
            }
            return { T, S, V, PH, tStop, dt };
        };

        // first pass places the attention events in time, second applies their slowing
        const first = run(null);
        this.tables = first;
        const lookEvents = looks.map(lk => this._makeLook(lk, first));
        const second = run(lookEvents);
        this.tables = second;
        this.looks = looks.map(lk => this._makeLook(lk, second, lookEvents));

        // gentle smoothing of s(t) so gait start and stop have no kinks (keeps it monotonic)
        const S = second.S, n = S.length, sm = new Float64Array(n), r = 24;
        for (let i = 0; i < n; i++) {
            let a = 0, w = 0;
            for (let k = -r; k <= r; k++) {
                const j = clamp(i + k, 0, n - 1);
                const g = Math.exp(-(k * k) / (2 * (r / 2.5) ** 2));
                a += S[j] * g; w += g;
            }
            sm[i] = a / w;
        }
        for (let i = 1; i < n; i++) sm[i] = Math.max(sm[i], sm[i - 1]);
        second.Ss = sm;
        // speed of the smoothed walk, which drives the gait envelope continuously
        const vs = new Float64Array(n);
        for (let i = 0; i < n; i++) vs[i] = (sm[Math.min(n - 1, i + 1)] - sm[Math.max(0, i - 1)]) / (2 * second.dt);
        second.Vs = vs;
        this.duration = second.T[n - 1];
        this.walkEnd = second.tStop;
        this._simulateGaze();
    }

    // The head, simulated. The walker's attention picks a goal - the path a few metres ahead with
    // small idle glances around it, or something on the way, re-fixated once or twice while
    // looking - and the goal steps from one to the next. The head chases it like a damped spring
    // (velocity peaks early, settles late, overshoots a little), tuned per movement so bigger turns
    // take longer, as head turns do; the goal itself is eased over ~45 ms so no turn starts with a
    // jolt. The phone in the hands follows the head through a second, stiffer spring.
    _simulateGaze() {
        const cfg = this.cfg, tb = this.tables, dt = tb.dt, n = tb.T.length;
        const rnd = prng(cfg.seed * 7919 + 13);
        const GY = new Float64Array(n), GP = new Float64Array(n), GV = new Float64Array(n), BY = new Float64Array(n);

        // attention windows: when each look holds the goal, and where its re-fixations fall
        const windows = this.looks.map((lk, k) => {
            const src = lk.src;
            const tin = src.in ?? 0.75, hold = src.hold ?? 1.2;
            const t1 = lk.t0 + tin + hold;
            const scans = [];
            if (hold > 0.6) scans.push({ t: lk.t0 + tin + hold * (0.35 + 0.2 * rnd()), dy: (rnd() * 2 - 1) * 5, dp: (rnd() * 2 - 1) * 2.5 });
            if (hold > 1.25) scans.push({ t: lk.t0 + tin + hold * (0.7 + 0.15 * rnd()), dy: (rnd() * 2 - 1) * 4, dp: (rnd() * 2 - 1) * 2 });
            return { k, src, t0: lk.t0, t1, scans, damp: 0.64 + 0.14 * rnd() };
        });
        const activeWindow = t => windows.find(w => t >= w.t0 && t < w.t1);

        // idle glances around the path ahead: small and irregular, now and then a look at the ground
        const idle = [];
        for (let t = 0.2; t < this.duration; ) {
            const r = rnd();
            let dy = (rnd() * 2 - 1) * (2 + 6 * rnd()), dp = (rnd() * 2 - 1) * 1.5 + 0.5;
            let len = 1.4 + 2.2 * rnd();
            if (r < 0.14) { dp = -(7 + 5 * rnd()); dy *= 0.4; len = 0.6 + 0.5 * rnd(); }   // check the footing
            else if (r < 0.22) { dp = 2.5 + 2 * rnd(); }                                  // look further down the lane
            idle.push({ t, dy, dp, damp: 0.66 + 0.14 * rnd() });
            t += len;
        }
        let idleIdx = 0;

        // head state (deg), its eased goal, the phone's state; spring per movement
        let gfY = 0, gfP = 0, hY = 0, hP = 0, hvY = 0, hvP = 0, cY = 0, cP = 0, cvY = 0, cvP = 0;
        let omega = 6, zeta = 0.7, key = '', prevBase = null;
        const wc = 2 * Math.PI * 2.8, zc = 0.55;      // the hands
        const ease = 1 - Math.exp(-dt / 0.045);
        const p = [0, 0], q = [0, 0];

        for (let i = 0; i < n; i++) {
            const t = tb.T[i], s = tb.Ss[i], v = tb.Vs[i];
            pathAt(this.path, s, p);
            const X = p[0], Z = p[1], Y = floorY(Z) + cfg.eyeHeight;

            // the path ahead (yaw unwrapped so it never jumps at +-180)
            const kv = clamp(v / cfg.speed, 0, 1);
            const la = 3.4 + 1.6 * kv;
            pathAt(this.path, s + la, q);
            let baseY = Math.atan2(-(q[0] - X), -(q[1] - Z)) / DEG;
            if (prevBase !== null) baseY = prevBase + wrapAngle((baseY - prevBase) * DEG) / DEG;
            prevBase = baseY;
            const baseP = (-Math.atan2(0.3, la) + (floorY(q[1]) - floorY(Z)) / la) / DEG;

            // the goal
            let goalY, goalP, goalKey, damp;
            const win = activeWindow(t);
            if (win) {
                const src = win.src;
                if (src.target) {
                    const tw = plyToWorld(src.target[0], src.target[1], src.target[2]);
                    const ty = Math.atan2(-(tw.x - X), -(tw.z - Z)) / DEG;
                    const tp = Math.atan2(tw.y - Y, Math.hypot(tw.x - X, tw.z - Z)) / DEG;
                    const maxYaw = src.maxYaw ?? 65;
                    goalY = baseY + clamp(wrapAngle((ty - baseY) * DEG) / DEG, -maxYaw, maxYaw);
                    goalP = clamp(tp, -35, 35);
                } else {
                    goalY = baseY + (src.yaw ?? 0);
                    goalP = baseP + (src.pitch ?? 0);
                }
                let sk = 0;
                for (const sc of win.scans) if (t >= sc.t) { goalY += sc.dy; goalP += sc.dp; sk++; }
                goalKey = `w${win.k}.${sk}`;
                damp = win.damp;
            } else {
                while (idleIdx + 1 < idle.length && idle[idleIdx + 1].t <= t) idleIdx++;
                const g = idle[idleIdx];
                // glances shrink while standing still and settle as the walk ends
                const amt = 0.45 + 0.55 * kv;
                goalY = baseY + g.dy * amt;
                goalP = baseP + g.dp * (g.dp < -5 ? kv : amt);
                goalKey = `i${idleIdx}`;
                damp = g.damp;
            }

            if (i === 0) {
                gfY = hY = cY = goalY; gfP = hP = cP = goalP;
            }
            if (goalKey !== key) {
                // a new movement: duration grows with its size (main sequence)
                key = goalKey;
                const amp = Math.hypot(goalY - hY, goalP - hP);
                const T = 0.28 + 0.008 * amp;
                omega = 2.6 / T;
                zeta = damp;
            }

            gfY += (goalY - gfY) * ease; gfP += (goalP - gfP) * ease;
            const aY = omega * omega * (gfY - hY) - 2 * zeta * omega * hvY;
            const aP = omega * omega * (gfP - hP) - 2 * zeta * omega * hvP;
            hvY += aY * dt; hvP += aP * dt;
            const sp = Math.hypot(hvY, hvP);
            if (sp > 240) { hvY *= 240 / sp; hvP *= 240 / sp; }
            hY += hvY * dt; hP += hvP * dt;

            const caY = wc * wc * (hY - cY) - 2 * zc * wc * cvY;
            const caP = wc * wc * (hP - cP) - 2 * zc * wc * cvP;
            cvY += caY * dt; cvP += caP * dt;
            cY += cvY * dt; cP += cvP * dt;

            GY[i] = cY; GP[i] = cP; GV[i] = cvY; BY[i] = baseY;
        }
        Object.assign(tb, { GY, GP, GV, BY });
    }

    _gazeLookup(t) {
        const tb = this.tables;
        const f = clamp(t / tb.dt, 0, tb.T.length - 1);
        const i = Math.floor(f), j = Math.min(i + 1, tb.T.length - 1), u = f - i;
        const l = (a) => a[i] + (a[j] - a[i]) * u;
        return { yaw: l(tb.GY), pitch: l(tb.GP), yawVel: l(tb.GV), base: l(tb.BY) };
    }

    _makeLook(lk, tables, prev) {
        // time the event starts: given directly, or when the walker reaches `at` metres
        let t0 = lk.t;
        if (lk.afterStop !== undefined) {
            t0 = tables.tStop + lk.afterStop;
        } else if (t0 === undefined) {
            const { S, T } = tables;
            let i = 0;
            while (i < S.length - 1 && S[i] < lk.at) i++;
            t0 = T[i];
        }
        if (prev && lk.afterStop === undefined) {
            // keep the times from the first pass so the slowdown doesn't move its own cause
            const p = prev.find(e => e.src === lk);
            if (p) t0 = p.t0;
        }
        const tin = lk.in ?? 0.75, hold = lk.hold ?? 1.2, tout = lk.out ?? 0.85;
        const weight = (t) => {
            if (t < t0 || t > t0 + tin + hold + tout) return 0;
            if (t < t0 + tin) return minJerk((t - t0) / tin);
            if (t < t0 + tin + hold) return 1;
            return 1 - minJerk((t - t0 - tin - hold) / tout);
        };
        return { src: lk, t0, weight, slow: lk.slow };
    }

    _lookup(t) {
        const tb = this.tables;
        const f = clamp(t / tb.dt, 0, tb.T.length - 1);
        const i = Math.floor(f), j = Math.min(i + 1, tb.T.length - 1), u = f - i;
        return {
            s: tb.Ss[i] + (tb.Ss[j] - tb.Ss[i]) * u,
            v: tb.Vs[i] + (tb.Vs[j] - tb.Vs[i]) * u,
            ph: tb.PH[i] + (tb.PH[j] - tb.PH[i]) * u
        };
    }

    /**
     * Camera pose at time t.
     *
     * @param {number} t - seconds from the start of the shot
     * @param {Vec3} pos - receives the position
     * @param {Quat} rot - receives the rotation
     * @returns {object} debug values
     */
    sample(t, pos, rot, gazeWeight = 1) {
        const cfg = this.cfg;
        const N = this.noise;
        const { s, v, ph } = this._lookup(t);
        const e = Math.pow(clamp(v / cfg.speed, 0, 1), 0.8); // gait amplitude envelope

        // where the body is and which way it faces
        const p = pathAt(this.path, s, [0, 0]);
        const pa = pathAt(this.path, s - 0.4, [0, 0]);
        const pb = pathAt(this.path, s + 0.4, [0, 0]);
        let fx = pb[0] - pa[0], fz = pb[1] - pa[1];
        const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
        const rx = -fz, rz = fx; // body right

        // --- gait: the head rides the pendulum of each step ---
        const phi = ph;                       // integer = heel strike
        // one leg pushes a little harder, and no two steps are quite alike
        const asym = (1 + 0.065 * Math.cos(Math.PI * phi)) * (1 + 0.12 * N[7].at(phi * 0.9 + 40));
        const c1 = Math.cos(2 * Math.PI * phi), c2 = Math.cos(4 * Math.PI * phi + 0.6);
        const bob = -e * 0.019 * asym * (c1 + 0.16 * c2);
        const sway = e * 0.017 * Math.sin(Math.PI * phi);
        const surge = e * 0.006 * Math.sin(2 * Math.PI * phi);
        // heel-strike shock through the arms: a smooth ~50 ms dip after each footfall
        const tau = (phi - Math.floor(phi)) / cadence(v);
        const u = tau / 0.05;
        const shock = e * u * u * Math.exp(2 * (1 - u));

        // breathing and body sway while standing still
        const still = 1 - e;
        const breathe = 0.0035 * Math.sin(2 * Math.PI * 0.24 * t + 0.4) * still;
        const standSway = 0.006 * N[6].fbm(t * 0.35) * still;

        // hand drift: slow wander of the phone in the hands
        const hx = 0.007 * N[0].fbm(t * 0.45), hy = 0.006 * N[1].fbm(t * 0.5), hz = 0.005 * N[2].fbm(t * 0.4);

        const lateral = sway + standSway + hx;
        const fwd = surge + hz;
        const X = p[0] + rx * lateral + fx * fwd;
        const Z = p[1] + rz * lateral + fz * fwd;
        const Y = floorY(Z) + cfg.eyeHeight + bob + breathe + hy - 0.0016 * shock;
        pos.set(X, Y, Z);

        // --- gaze: the simulated head (degrees) ---
        const gz = this._gazeLookup(t);

        // --- what the body and hands add on top ---
        const gy = e * 0.75 * Math.sin(Math.PI * phi - 0.9);        // trunk counter-rotation
        const gp = e * 0.5 * Math.sin(2 * Math.PI * phi - 0.7);      // nod per step
        const gr = e * 0.6 * Math.sin(Math.PI * phi + 0.3);          // tilt toward the stance foot
        const ny = 0.65 * N[3].fbm(t * 0.32) + 0.07 * N[3].at(t * 4.7 + 100);
        const np = 0.5 * N[4].fbm(t * 0.38) + 0.06 * N[4].at(t * 5.3 + 100);
        const nr = 0.45 * N[5].fbm(t * 0.27) + 0.05 * N[5].at(t * 4.1 + 100);
        const jolt = 0.16 * shock;

        // a turning head rolls into the turn and dips a little on the way round; held to one side
        // it stays tilted slightly that way
        const lean = clamp(gz.yawVel * 0.018, -1.6, 1.6);
        const tilt = clamp((gz.yaw - gz.base) * 0.03, -1.8, 1.8);
        const dip = Math.min(1.2, Math.abs(gz.yawVel) * 0.01);

        const Yd = gz.base + (gz.yaw - gz.base) * gazeWeight + gy + ny;
        const Pd = gz.pitch * gazeWeight + gp + np - jolt - dip;
        const Rd = gr + nr + lean + tilt;
        qYaw.setFromAxisAngle(Vec3.UP, Yd);
        qPitch.setFromAxisAngle(Vec3.RIGHT, Pd);
        qRoll.setFromAxisAngle(Vec3.BACK, Rd);
        rot.copy(qYaw).mul(qPitch).mul(qRoll);

        return { s, v, phi, yaw: Yd, pitch: Pd, roll: Rd, gazeYaw: gz.yaw, gazePitch: gz.pitch };
    }

    /**
     * Every footfall of the walk: the moments the gait phase crosses a whole step, which is where
     * the bob bottoms out and the heel-strike shock starts.
     *
     * @returns {{t: number, foot: number, speed: number, z: number}[]} - time, which foot (0/1),
     * walking speed then (m/s) and where along the passage (world z)
     */
    footfalls() {
        const { T, PH, Vs, dt } = this.tables;
        const out = [];
        for (let i = 1; i < T.length; i++) {
            const a = Math.floor(PH[i - 1]), b = Math.floor(PH[i]);
            if (b <= a) continue;
            const f = (b - PH[i - 1]) / Math.max(1e-9, PH[i] - PH[i - 1]);
            const t = T[i - 1] + f * dt;
            const s = this._lookup(t).s;
            out.push({ t, foot: b & 1, speed: Vs[i], z: pathAt(this.path, s, [0, 0])[1] });
        }
        return out;
    }

    // the walker's world z at time t
    zAt(t) {
        return pathAt(this.path, this._lookup(t).s, [0, 0])[1];
    }

    // the walker's ground position along the path, for the depth proxy
    groundZ(t) {
        const { s } = this._lookup(t);
        return pathAt(this.path, s, [0, 0])[1];
    }

    floorAt(z) {
        return floorY(z);
    }
}

const qYaw = new Quat(), qPitch = new Quat(), qRoll = new Quat();
