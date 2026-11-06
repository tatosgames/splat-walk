import test from 'node:test';
import assert from 'node:assert/strict';
import { AdaptiveScale } from '../../src/adaptive-scale.js';

test('adaptive scale waits over five seconds below 25 fps before lowering resolution', () => {
    const scale = new AdaptiveScale();
    assert.equal(scale.update(0.7, 24, 0), 0.7);
    assert.equal(scale.update(0.7, 24, 5000), 0.7);
    assert.equal(scale.update(0.7, 24, 5001), 0.64);
    assert.equal(scale.update(0.64, 24, 10001), 0.64, 'cooldown prevents repeated resize churn');
    assert.equal(scale.update(0.64, 24, 10002), 0.58);
});

test('adaptive scale restores resolution only after stable performance above 55 fps', () => {
    const scale = new AdaptiveScale();
    assert.equal(scale.update(0.7, 55, 0), 0.7, '55 fps is below the strict recovery threshold');
    assert.equal(scale.update(0.7, 56, 1000), 0.7);
    assert.equal(scale.update(0.7, 56, 3499), 0.7);
    assert.equal(scale.update(0.7, 56, 3500), 0.725);
    assert.equal(scale.update(0.725, 40, 4000), 0.725, 'middle band clears recovery dwell');
    assert.equal(scale.update(0.725, 56, 5000), 0.725);
    assert.equal(scale.update(0.725, 56, 7500), 0.75);
    assert.equal(scale.update(0.99, 60, 10000), 1);
});

test('adaptive scale ignores invalid measurements and respects the minimum', () => {
    const scale = new AdaptiveScale();
    assert.equal(scale.update(0.7, NaN, 0), 0.7);
    let current = 0.37;
    for (let now = 0; now <= 20000; now += 1000) current = scale.update(current, 20, now);
    assert.equal(current, 0.35);
});
