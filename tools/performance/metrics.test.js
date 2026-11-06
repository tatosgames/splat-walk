import test from 'node:test';
import assert from 'node:assert/strict';
import { distribution, summarize } from './metrics.js';
test('missing GPU timing is unavailable, not zero', () => {
    assert.equal(distribution([null, undefined, NaN]).count, 0);
    assert.equal(distribution([]).p95, null);
});
test('actual rendering cadence and skipped timeline ticks remain separate', () => {
    const samples = [{ at: 0, time: 0 }, { at: 1000 / 60, time: 1 / 60 }, { at: 50, time: 3 / 60 }];
    const s = summarize(samples, 60);
    assert.equal(s.renderedFrames, 3);
    assert.equal(s.renderedFps, 40);
    assert.equal(s.videoTicksMissed, 1);
    assert.equal(s.gpuMs.median, null);
});
