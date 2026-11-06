import { summarize } from './metrics.js';
import './panel.css';

performance.setResourceTimingBufferSize(4000);
const marks = { entry: performance.now() };
const errors = [];
const results = [];
let api, active, pendingFrame = false;
const counters = { updates: 0, renders: 0 };
globalThis.__splatProbe = {
    frozen: false,
    mark(name) { marks[name] ??= performance.now(); },
    fail(message) { errors.push(message); },
    attach(value) {
        api = value;
        api.app.on('update', () => { counters.updates++; });
        api.app.on('postrender', () => { pendingFrame = true; counters.renders++; });
        api.app.on('frameend', () => {
            if (!pendingFrame) return;
            pendingFrame = false;
            if (!active || api.state !== 'playing' || document.hidden) return;
            const gp = api.device.gpuProfiler;
            active.push({ at: performance.now(), time: api.time, fps: api.fps,
                cpuUpdate: api.app.stats.cpuUpdateTime, cpuRender: api.app.stats.cpuRenderTime,
                gpu: gp?.frameTime ?? null, passes: Object.fromEntries(gp?.passTimings ?? []),
                gpuBytes: api.app.stats.vramTotalBytes ?? null, scale: api.scale,
                target: [api.sceneTarget.width, api.sceneTarget.height] });
        });
    }
};
addEventListener('error', e => errors.push(e.message));
addEventListener('unhandledrejection', e => errors.push(String(e.reason)));
addEventListener('visibilitychange', () => { if (active && document.hidden) errors.push('Run invalid: tab hidden during recording'); });
addEventListener('resize', () => { if (active) errors.push('Run invalid: viewport changed during recording'); });

const panel = document.createElement('section');
panel.id = 'performance-panel';
panel.setAttribute('aria-label', 'Benchmark');
panel.innerHTML = `<details open><summary>Benchmark Splat Walk</summary>
<p>Misura il renderer attuale. Mantieni la pagina visibile. I risultati restano sul dispositivo.</p>
<label>Modello dispositivo <input id="perf-model" placeholder="Es. iPhone 13, Safari"></label>
<label>Condizioni <input id="perf-notes" placeholder="Batteria, alimentazione, rete"></label>
<label>Scenario <select id="perf-scenario"><option value="walk">Passeggiata, 3 ripetizioni</option><option value="burn">Burn e ripristino, 20 s</option><option value="thermal">Sessione di 5 minuti</option></select></label>
<label>Frame rate <select id="perf-fps"><option>30</option><option>60</option></select></label>
<label>Backend <select id="perf-backend"><option value="auto">WebGPU se disponibile</option><option value="webgl">WebGL 2</option></select></label>
<div class="perf-actions"><button id="perf-config">Applica e ricarica</button><button id="perf-run" disabled>Avvia test</button><button id="perf-stop" disabled>Ferma</button><button id="perf-export">Esporta JSON</button></div>
<p id="perf-status" role="status">Caricamento scena…</p>
<p><a href="./">Apri la demo</a> · Ripetere in portrait e landscape, con la pagina visibile.</p>
</details>`;
document.body.append(panel);
const el = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
el('perf-fps').value = params.get('fps') ?? '60';
el('perf-backend').value = params.has('webgl') ? 'webgl' : 'auto';
const status = message => { el('perf-status').textContent = message; };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let cancelled = false, running = false;

async function ready(timeout = 240000) {
    const start = performance.now();
    while (!api || !['ready', 'paused', 'ended'].includes(api.state)) {
        if (performance.now() - start > timeout) throw new Error('Scene readiness timeout');
        if (errors.length) throw new Error(errors.at(-1));
        await delay(100);
    }
}

function metadata() {
    const gl = api.device.gl;
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    let pcmBytes = 0;
    const buffers = [api.soundtrack.steps, ...Object.values(api.soundtrack.buffers ?? {}), ...Object.values(api.soundtrack.beds ?? {})];
    for (const b of buffers) if (b?.length && b?.numberOfChannels) pcmBytes += b.length * b.numberOfChannels * 4;
    return { schemaVersion: 1, createdAt: new Date().toISOString(), userAgent: navigator.userAgent,
        model: el('perf-model').value, conditions: el('perf-notes').value,
        viewport: [innerWidth, innerHeight], dpr: devicePixelRatio, screen: [screen.width, screen.height],
        refreshHz: null, refreshNote: 'Confirm display refresh in device settings; RAF rate is not a hardware refresh measurement.',
        canvas: [api.device.width, api.device.height], backend: api.device.deviceType,
        gpu: api.device.isWebGPU ? Object.fromEntries(['vendor', 'architecture', 'device', 'description', 'isFallbackAdapter'].map(k => [k, api.device.gpuAdapter?.info?.[k] ?? null])) :
            (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unavailable'),
        engine: api.engine, fps: api.fps, requestedFps: api.config?.fps ?? api.fps,
        profile: api.config?.profile ?? 'original', sceneUrl: api.sceneUrl, taps: api.knobs.taps, filmPassName: api.film.name,
        splatRenderer: api.gs.currentRenderer, alphaClipForward: api.gs.alphaClipForward, lens: [...api.film.lens],
        walkDuration: api.walk.duration,
        params: Object.fromEntries(params), audioPcmBytes: pcmBytes,
        gpuMemoryNote: 'Engine-accounted allocations only, not process VRAM or physical GPU memory.',
        selectedGaussians: null, selectedGaussiansNote: 'No verified public per-frame counter collected.',
        heapBytes: performance.memory?.usedJSHeapSize ?? null };
}

function loading() {
    const resources = performance.getEntriesByType('resource').map(r => ({
        url: r.name, startMs: r.startTime, endMs: r.responseEnd, durationMs: r.duration,
        transferBytes: r.transferSize, encodedBytes: r.encodedBodySize, decodedBytes: r.decodedBodySize,
        deliveryType: r.deliveryType ?? '', protocol: r.nextHopProtocol
    }));
    const nav = performance.getEntriesByType('navigation')[0];
    return { marks: { ...marks }, readyMs: marks.ready ?? null,
        resources, transferBytes: resources.reduce((n, r) => n + r.transferBytes, nav?.transferSize ?? 0),
        transferBeforeReadyBytes: resources.filter(r => r.endMs <= (marks.ready ?? 0)).reduce((n, r) => n + r.transferBytes, nav?.transferSize ?? 0),
        deviceInitMs: marks.deviceReady - marks.deviceStart,
        sceneToSettledMs: marks.streamSettled - marks.sceneRequest,
        initialBenchmarkMs: marks.ready - marks.benchmarkStart,
        limitation: 'Scene decoding, upload and shader compilation overlap and are aggregated in scene/prepare timings. Zero transferSize is not proof of a cache hit; use runner CDP cache flags.' };
}

async function run({ seconds, startTime = 0, burn = false, exercise = false, warmup = 2 } = {}) {
    await ready();
    document.body.classList.remove('benchmark-capture');
    panel.querySelector('details').open = false;
    cancelled = false; running = true; globalThis.__splatProbe.frozen = false;
    const started = performance.now();
    const runErrorsStart = errors.length;
    api.reset(); api.seek(startTime); api.play();
    active = [];
    const all = active;
    let single = false, second = false, replay = 0, lastExercise = -1;
    while (!cancelled) {
        const elapsed = (performance.now() - started) / 1000;
        if (document.hidden) { errors.push('Run invalid: hidden tab'); break; }
        if (performance.now() - (all.at(-1)?.at ?? started) > 10000) { errors.push('Renderer stalled for 10 seconds'); break; }
        if (seconds != null && elapsed >= seconds) break;
        if (api.state === 'ended') {
            if (seconds == null) break;
            api.pause(); api.seek(0); api.play(); replay++;
        }
        if (burn && !single && elapsed >= 3) { api.ignite(); single = true; }
        if (burn && !second && elapsed >= 3.5) { api.ignite(); second = true; }
        if (exercise && Math.floor(elapsed / 10) !== lastExercise) {
            lastExercise = Math.floor(elapsed / 10);
            api.cameraLook.targetYaw = lastExercise % 2 ? -30 : 30;
            api.cameraLook.targetPitch = lastExercise % 2 ? -10 : 10;
            api.ignite();
        }
        await delay(50);
        if (elapsed > (seconds ?? api.walk.duration + 60) + 60) { errors.push('Run timeout'); break; }
    }
    active = null; api.pause(); running = false;
    // Exclude warmup and replay boundaries from percentiles/tick counting.
    const usable = all.filter(s => s.at >= started + warmup * 1000);
    if (usable.length < 3) errors.push('Insufficient rendered frames after warm-up');
    const segments = [[]];
    for (const s of usable) {
        const segment = segments.at(-1);
        if (segment.length && (s.time < segment.at(-1).time || s.fps !== segment.at(-1).fps)) segments.push([]);
        segments.at(-1).push(s);
    }
    const result = { metadata: metadata(), scenario: { seconds: seconds ?? 'full-walk', startTime, burn, exercise, warmup, replay },
        loading: loading(), valid: !cancelled && errors.length === runErrorsStart,
        errors: errors.slice(runErrorsStart), segments: segments.filter(s => s.length).map(s => ({ targetFps:s[0].fps, ...summarize(s, s[0].fps) })),
        samples: all };
    results.push(result);
    return result;
}

function exportResults() {
    const blob = new Blob([JSON.stringify({ results, errors, loading: loading() }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `splat-baseline-${Date.now()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
el('perf-config').onclick = () => {
    const p = new URLSearchParams(location.search); p.set('fps', el('perf-fps').value);
    p.delete('webgl'); if (el('perf-backend').value === 'webgl') p.set('webgl', '');
    location.search = p.toString();
};
el('perf-run').onclick = async () => {
    el('perf-run').disabled = true; el('perf-config').disabled = true; el('perf-stop').disabled = false;
    try {
        const scenario = el('perf-scenario').value, count = scenario === 'walk' ? 3 : 1;
        for (let i = 0; i < count; i++) {
            status(`Test ${i + 1}/${count} in corso… mantieni la pagina visibile.`);
            const result = await run(scenario === 'thermal' ? { seconds: 300, exercise: true } : scenario === 'burn' ? { seconds: 20, startTime: 16, burn: true } : {});
            if (!result.valid) break;
        }
        const last = results.at(-1), segment = last?.segments.at(-1);
        if (!last?.valid) status(`Test non valido o interrotto. ${last?.errors.join('; ') ?? ''} Il JSON resta disponibile.`);
        else status(`${results.length} risultati. Ultimo segmento: ${segment?.renderedFps?.toFixed(1) ?? 'n/d'} fps; GPU p95 ${segment?.gpuMs.p95?.toFixed(1) ?? 'n/d'} ms. Esporta il JSON per il confronto completo.`);
    } catch (e) { status(String(e)); }
    finally { panel.querySelector('details').open = true; el('perf-run').disabled = false; el('perf-config').disabled = false; el('perf-stop').disabled = true; }
};
el('perf-stop').onclick = () => { cancelled = true; };
el('perf-export').onclick = exportResults;
globalThis.__splatBenchmark = { ready, run, metadata, loading, results, errors, counters,
    capture: async (t, effect = -1) => {
        await ready(); document.body.classList.add('benchmark-capture');
        // Drain asynchronous sorting/color work at the same frozen pose before capture.
        for (let i = 0; i < 8; i++) { api.capture(t, effect); await delay(100); }
    },
    get state() { return api?.state; }, get running() { return running; } };

try {
    await import('../../src/main.js');
    await ready();
    el('perf-run').disabled = false;
    status('Pronto. Scegli uno scenario e avvia il test.');
} catch (e) { errors.push(String(e)); status(`Avvio non riuscito: ${e}`); }
