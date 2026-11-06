// Input changes orientation only; poseAt applies it to every exposure sample.
import { Quat, Vec3 } from 'playcanvas';
export class CameraLook {
    constructor(canvas, onTap, onChange, onActivity, enabled = () => true) {
        this.yaw = 0; this.pitch = 0; this.targetYaw = 0; this.targetPitch = 0;
        this.pointer = null; this.dragging = false; this.settling = false;
        this.gazeWeight = 1;
        this.contacts = new Set();
        this.canvas = canvas;
        this.qYaw = new Quat(); this.qPitch = new Quat();
        const cancel = () => { this.pointer = null; this.dragging = false; };
        canvas.addEventListener('pointerdown', e => {
            if (e.button !== 0 || !enabled()) return;
            onActivity();
            this.contacts.add(e.pointerId);
            if (this.contacts.size > 1) { cancel(); return; }
            this.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, at: performance.now(), yaw: this.targetYaw, pitch: this.targetPitch, moved: false };
            canvas.setPointerCapture(e.pointerId);
        });
        canvas.addEventListener('pointermove', e => {
            const p = this.pointer;
            if (!p || p.id !== e.pointerId) return;
            const dx = e.clientX - p.x, dy = e.clientY - p.y;
            if (Math.hypot(dx, dy) > 8) p.moved = true;
            if (!p.moved) return;
            this.dragging = true; this.settling = true;
            this.targetYaw = Math.max(-60, Math.min(60, p.yaw - dx / canvas.clientWidth * 100));
            this.targetPitch = Math.max(-30, Math.min(30, p.pitch - dy / canvas.clientHeight * 70));
            onChange();
        });
        canvas.addEventListener('pointerup', e => {
            this.contacts.delete(e.pointerId);
            const p = this.pointer;
            if (!p || p.id !== e.pointerId) return;
            const tap = !p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) <= 8 && performance.now() - p.at <= 250;
            cancel();
            if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
            if (tap) onTap(e.clientX, e.clientY);
            onActivity();
        });
        canvas.addEventListener('pointercancel', e => { this.contacts.delete(e.pointerId); cancel(); });
        canvas.addEventListener('lostpointercapture', e => { this.contacts.delete(e.pointerId); cancel(); });
        addEventListener('blur', () => { this.contacts.clear(); cancel(); });
        addEventListener('resize', () => { this.contacts.clear(); cancel(); });
    }
    reset(immediate = false) {
        const id = this.pointer?.id;
        this.pointer = null; this.dragging = false; this.contacts.clear();
        if (id !== undefined && this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
        this.targetYaw = 0; this.targetPitch = 0; this.settling = !immediate;
        if (immediate) { this.yaw = 0; this.pitch = 0; this.gazeWeight = 1; }
    }
    update(dt) {
        const amount = 1 - Math.exp(-Math.min(dt, 0.1) * 20);
        this.yaw += (this.targetYaw - this.yaw) * amount;
        this.pitch += (this.targetPitch - this.pitch) * amount;
        this.settling = Math.abs(this.targetYaw - this.yaw) + Math.abs(this.targetPitch - this.pitch) > 0.02;
        this.gazeWeight += ((this.dragging ? 0 : 1) - this.gazeWeight) * amount;
        return this.dragging || this.settling || (1 - this.gazeWeight > 0.001);
    }
    apply(rotation) {
        this.qYaw.setFromAxisAngle(Vec3.UP, this.yaw);
        this.qPitch.setFromAxisAngle(Vec3.RIGHT, this.pitch);
        rotation.mul2(this.qYaw, rotation).mul(this.qPitch);
    }
}
