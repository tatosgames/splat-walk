import test from 'node:test';
import assert from 'node:assert/strict';
import { Soundtrack } from '../../src/audio.js';
test('pause and burn while lazy audio is still loading do not touch an unbuilt graph', () => {
    const sound = new Soundtrack({ footfalls: () => [] });
    sound.ctx = {};
    sound.buffers = { 'fx-burn': {} };
    assert.doesNotThrow(() => sound.stop());
    assert.doesNotThrow(() => sound.playFx('fx-burn'));
});
