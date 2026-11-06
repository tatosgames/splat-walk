import test from 'node:test';
import assert from 'node:assert/strict';
import { settings, outputRatio, viewTanHalf, nextRenderDeadline } from '../../src/settings.js';
test('invalid URL values cannot divide by zero or select an inherited profile', () => {
    const s = settings(new URLSearchParams('profile=__proto__&fps=NaN&taps=0&shutter=0&readout=-1&maxh=Infinity'));
    assert.equal(s.profile, 'performance'); assert.equal(s.fps, 60); assert.equal(s.taps, 1);
    assert(s.shutter > 0); assert.equal(s.readout, 0); assert.equal(s.maxh, 2160);
});
test('Auto allows recovery above 55 fps while fixed profiles retain their 50 fps default', () => {
    assert.equal(settings(new URLSearchParams()).fps, 60);
    assert.equal(settings(new URLSearchParams('profile=performance')).fps, 50);
    assert.equal(settings(new URLSearchParams('profile=auto&fps=50')).fps, 50);
});
test('cover crop preserves vertical FOV in portrait and horizontal FOV on wide phones', () => {
    const base = Math.tan(50 * Math.PI / 360);
    assert.equal(viewTanHalf(50, 390 / 844), base);
    assert(Math.abs(viewTanHalf(50, 844 / 390) * (844 / 390) - base * 16 / 9) < 1e-12);
});
test('portrait and landscape respect the same pixel and long-edge budgets', () => {
    const s = settings(new URLSearchParams());
    for (const [w, h] of [[390, 844], [844, 390], [3840, 2160]]) {
        const r = outputRatio(w, h, 3, s);
        assert(w * h * r * r <= s.maxPixels + 1);
        assert(Math.max(w, h) * r <= s.maxLong + 1);
    }
});
test('paused animation deadlines retain 50 fps between display callbacks instead of halving cadence', () => {
    for (const refresh of [56,60,120]) {
        let deadline=0, frames=0;
        for (let now=0; now<5000; now+=1000/refresh) {
            if (now+1>=deadline) { frames++; deadline=nextRenderDeadline(deadline,now,50); }
        }
        assert(Math.abs(frames-250)<=2, `${refresh} Hz produced ${frames} frames`);
    }
    assert.equal(nextRenderDeadline(120,110,50),120, 'An early forced frame must not accumulate future deadlines');
});
