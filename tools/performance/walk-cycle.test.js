import test from 'node:test';
import assert from 'node:assert/strict';
import { Quat, Vec3 } from 'playcanvas';
import { Walk } from '../../src/walk.js';
import { ROUTE } from '../../src/route.js';

test('out-and-back playback reuses the route and turns continuously at both ends', () => {
    const walk = new Walk(ROUTE);
    const position = new Vec3(), rotation = new Quat();
    const outboundEnd = walk.playbackPose(walk.loopLegDuration);
    const outboundTurn = walk.playbackPose(walk.loopLegDuration + walk.turnDuration / 2);
    const returnMiddle = walk.playbackPose(walk.loopLegDuration * 1.5);
    const returnEnd = walk.playbackPose(walk.loopDuration - walk.turnDuration / 2);
    const cycleEnd = walk.playbackPose(walk.loopDuration);

    assert(Math.abs(outboundEnd.time - walk.walkEnd) < 1e-9);
    assert.equal(outboundEnd.facingOffset, 0);
    assert(outboundTurn.facingOffset > 0 && outboundTurn.facingOffset < 180);
    assert.equal(returnMiddle.facingOffset, 180);
    assert(returnEnd.facingOffset > 0 && returnEnd.facingOffset < 180);
    assert(Math.abs(cycleEnd.time - walk.loopStart) < 1e-9);
    assert.equal(cycleEnd.facingOffset, 0);

    const outbound = walk.sample(outboundTurn.time, position, rotation);
    const returning = walk.samplePlayback(walk.loopLegDuration + walk.turnDuration / 2, position, rotation);
    assert.equal(returning.s, outbound.s);
    assert(returning.facingOffset > 0);
    assert.equal(walk.zAt(walk.loopDuration), walk.zAt(0));
});
