export class AdaptiveScale {
    constructor({ min = 0.35, max = 1, downFps = 25, downMs = 5000, upFps = 55, upMs = 2500,
        downStep = 0.06, upStep = 0.025, cooldownMs = 1000 } = {}) {
        Object.assign(this, { min, max, downFps, downMs, upFps, upMs, downStep, upStep, cooldownMs });
        this.reset();
    }

    reset() {
        this.belowSince = null;
        this.aboveSince = null;
        this.changedAt = -Infinity;
    }

    update(scale, fps, now) {
        if (!Number.isFinite(fps) || !Number.isFinite(now)) return scale;
        if (fps < this.downFps) {
            this.aboveSince = null;
            this.belowSince ??= now;
            if (now - this.belowSince <= this.downMs || now - this.changedAt < this.cooldownMs) return scale;
            const next = Math.max(this.min, Math.round((scale - this.downStep) * 1000) / 1000);
            if (next < scale) {
                this.changedAt = now;
                this.belowSince = now;
            }
            return next;
        }
        if (fps > this.upFps) {
            this.belowSince = null;
            this.aboveSince ??= now;
            if (now - this.aboveSince < this.upMs || now - this.changedAt < this.cooldownMs) return scale;
            const next = Math.min(this.max, Math.round((scale + this.upStep) * 1000) / 1000);
            if (next > scale) {
                this.changedAt = now;
                this.aboveSince = now;
            }
            return next;
        }
        this.belowSince = null;
        this.aboveSince = null;
        return scale;
    }
}
