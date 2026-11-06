const profiles = {
    performance: { scene: './scene/mobile-lite-v1.sog', taps: 4, maxLong: 896, maxPixels: 451584, maxDpr: 1.5 },
    balanced: { scene: './scene/balanced-v1.sog', taps: 6, maxLong: 1600, maxPixels: 1440000, maxDpr: 1.75 },
    quality: { scene: './scene/lod-meta.json', taps: 10, maxLong: 1920, maxPixels: 2073600, maxDpr: 2 }
};
export function numeric(params, name, fallback, min, max) {
    const raw = params.get(name);
    const n = raw === null || raw.trim() === '' ? NaN : Number(raw);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}
export function settings(params) {
    const requested = params.get('profile') ?? 'auto';
    const profile = Object.hasOwn(profiles, requested) ? requested : 'performance';
    return { profile, auto: requested === 'auto' || !Object.hasOwn(profiles, requested), ...profiles[profile],
        scene: params.get('scene') || profiles[profile].scene,
        fps: numeric(params, 'fps', 50, 15, 120), taps: Math.round(numeric(params, 'taps', profiles[profile].taps, 1, 24)),
        fov: numeric(params, 'fov', 50, 25, 90), shutter: numeric(params, 'shutter', 1 / 120, 0.0001, 0.1),
        readout: numeric(params, 'readout', 0.008, 0, 0.05), maxh: numeric(params, 'maxh', 2160, 240, 4320) };
}
export function outputRatio(w, h, dpr, config) {
    return Math.min(dpr, config.maxDpr, config.maxLong / Math.max(w, h), config.maxh / h,
        Math.sqrt(config.maxPixels / (w * h)));
}
export function viewTanHalf(fov, aspect) {
    return Math.tan(fov * Math.PI / 360) * Math.min(1, (16 / 9) / aspect);
}
