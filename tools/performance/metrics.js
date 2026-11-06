export function distribution(values) {
    const a = values.filter(Number.isFinite).sort((x, y) => x - y);
    const q = p => a.length ? a[Math.max(0, Math.ceil(p * a.length) - 1)] : null;
    return { count: a.length, median: q(0.5), p95: q(0.95), p99: q(0.99), max: a.at(-1) ?? null };
}

export function summarize(samples, fps) {
    // Samples contain rendered frames only. Timeline advances count skipped video ticks;
    // interval gaps separately capture browser stalls (even if the app clock clamps dt).
    const gaps = samples.slice(1).map((s, i) => s.at - samples[i].at);
    const missed = samples.slice(1).reduce((n, s, i) => n + Math.max(0,
        Math.round((s.time - samples[i].time) * fps) - 1), 0);
    const seconds = gaps.reduce((a, b) => a + b, 0) / 1000;
    const passNames = [...new Set(samples.flatMap(s => Object.keys(s.passes ?? {})))];
    return {
        renderedFrames: samples.length, seconds,
        renderedFps: seconds > 0 ? (samples.length - 1) / seconds : null,
        videoTicksMissed: missed, videoTicksMissedFraction: missed / Math.max(1, missed + samples.length - 1),
        intervalsMs: distribution(gaps), cpuUpdateMs: distribution(samples.map(s => s.cpuUpdate)),
        cpuRenderMs: distribution(samples.map(s => s.cpuRender)), gpuMs: distribution(samples.map(s => s.gpu)),
        cpuUpdateAndRenderMs: distribution(samples.filter(s => Number.isFinite(s.cpuUpdate) && Number.isFinite(s.cpuRender)).map(s => s.cpuUpdate + s.cpuRender)),
        scale: distribution(samples.map(s => s.scale)),
        gpuPassesMs: Object.fromEntries(passNames.map(n => [n, distribution(samples.map(s => s.passes?.[n]))])),
        maxAccountedGpuBytes: Math.max(0, ...samples.map(s => s.gpuBytes ?? 0)),
        gpuTimingNote: 'Asynchronous latest available timer readings; not aligned to the CPU frame. May repeat between reports.',
        presentationNote: 'Rendered/submitted frames, not physical display presentation. CPU update/render times are separate, not GPU time.'
    };
}
