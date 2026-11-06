import test from 'node:test';
import assert from 'node:assert/strict';
import { CameraLook } from '../../src/camera-look.js';

class Canvas extends EventTarget {
    clientWidth = 390;
    clientHeight = 844;
    captures = new Set();
    setPointerCapture(id) { this.captures.add(id); }
    hasPointerCapture(id) { return this.captures.has(id); }
    releasePointerCapture(id) { this.captures.delete(id); this.send('lostpointercapture', { pointerId: id }); }
    send(type, values = {}) {
        const e = new Event(type);
        for (const [key, value] of Object.entries({ button: 0, pointerId: 1, clientX: 100, clientY: 100, ...values })) Object.defineProperty(e, key, { value });
        this.dispatchEvent(e);
    }
}

test('drag, multitouch and cancellation never become taps; subsequent tap still works', () => {
    const previous = globalThis.addEventListener;
    globalThis.addEventListener = () => {};
    try {
        const c = new Canvas(); let taps = 0;
        const look = new CameraLook(c, () => taps++, () => {}, () => {});
        c.send('pointerdown'); c.send('pointermove', { clientX: 180 }); c.send('pointerup', { clientX: 180 });
        look.update(0.1); assert(Math.abs(look.yaw) > 5); assert.equal(taps, 0);
        const heldTarget = look.targetYaw;
        const returnAt = look.returnAt;
        look.update(0.02, returnAt - 1);
        assert.equal(look.targetYaw, heldTarget, 'Hold orientation for three seconds after release');
        const heldYaw = look.yaw;
        look.update(0.02, returnAt + 1);
        assert.equal(look.targetYaw, 0);
        assert(Math.abs(look.yaw) > 0 && Math.abs(look.yaw) < Math.abs(heldYaw), 'Return starts smoothly');
        c.send('pointerdown');
        assert.equal(look.targetYaw,look.yaw,'A new gesture interrupts the return at its current orientation');
        c.send('pointercancel');
        for (let i=0;i<200;i++) look.update(0.02,returnAt+1+i*20);
        assert.equal(look.yaw,0);
        c.send('pointerdown'); c.send('pointerdown', { pointerId: 2 });
        c.send('pointerup'); c.send('pointerup', { pointerId: 2 }); assert.equal(taps, 0);
        c.send('pointerdown'); c.send('pointercancel'); c.send('pointerup'); assert.equal(taps, 0);
        c.send('pointerdown'); c.send('pointerup'); assert.equal(taps, 1);
        look.reset(true); assert.equal(look.yaw, 0); assert.equal(look.pitch, 0); assert.equal(look.gazeWeight, 1);
    } finally { globalThis.addEventListener = previous; }
});
