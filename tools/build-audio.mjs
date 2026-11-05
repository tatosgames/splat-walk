/**
 * Builds the soundtrack assets in public/audio/:
 *   steps.mp3 + steps.json  - a sprite of single footsteps sliced from one generated take
 *   <event>.mp3             - one-shots placed on the timeline by src/audio.js
 *
 * Sounds come from the ElevenLabs sound-generation API. Raw results are cached in tools/raw/, so
 * re-runs cost nothing and need no key; new sounds need ELEVENLABS_API_KEY, or a key file named
 * by ELEVENLABS_KEY_FILE (default ~/Desktop/elevenlabs-key.txt). ffmpeg trims, normalises and
 * encodes.
 *
 * Run: node tools/build-audio.mjs
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const rawDir = join(here, 'raw');
const procDir = join(here, 'proc');
const outDir = join(here, '..', 'public', 'audio');
const KEY_FILE = process.env.ELEVENLABS_KEY_FILE ?? join(homedir(), 'Desktop', 'elevenlabs-key.txt');
for (const d of [rawDir, procDir, outDir]) mkdirSync(d, { recursive: true });

const STEPS = {
    name: 'steps-trainers',
    dur: 12,
    influence: 0.75,
    text: 'Footsteps of one person walking at a relaxed pace in trainers, soft rubber-soled sports shoes on stone paving slabs, muffled soft thuds with a little gritty scuff, no squeaks, each step clearly separated, dry close recording, no other sounds, no music'
};

// long continuous textures, looped and layered by src/audio.js into the city bed
const BEDS = [
    { name: 'bed-traffic', dur: 22, influence: 0.55, text: 'Distant city traffic ambience heard from a quiet pedestrian side street in London, a soft continuous hum of cars and buses several streets away, natural and calm, no music, no close voices' },
    { name: 'bed-murmur', dur: 22, influence: 0.55, text: 'Quiet city background ambience, a faint distant murmur of people and traffic a few streets away, the occasional far-off car, soft and continuous, overcast weekday morning, no music' },
    { name: 'bed-birds', dur: 22, influence: 0.55, text: 'Calm urban morning ambience in a narrow London lane, soft far-away traffic, a few distant pigeons and small birds now and then, gentle and continuous, no music, no wind noise' },
    // (a 'plane overhead' rumble take came back with a steady 200 Hz harmonic buzz; this replaces it)
    // ...and carried a steady 7 kHz whine of its own, notched out
    { name: 'bed-distant', dur: 22, influence: 0.5, notch: [6998], text: 'Very distant big city background heard between tall old buildings, a soft low wash of traffic far away, now and then a faint far-off horn, continuous and natural, no music, no nearby engines' }
];

// one-shots scattered faintly through the bed (and a few placed by the walk); levels in src/audio.js
const EVENTS = [
    { name: 'pigeons', dur: 4, text: 'Pigeons cooing softly with a short flutter of wings on a rooftop above a quiet city alley, no other sounds' },
    { name: 'voices', dur: 5, text: 'Faint distant conversation and brief laughter of a few people on a nearby street, far away and muffled, no music' },
    { name: 'siren', dur: 9, text: 'Very distant ambulance siren far away across a city, faint, slowly fading in and out, no other sounds' },
    { name: 'door', dur: 2.5, text: 'A wooden shop door closing gently with a small bell, heard a few metres away in a stone alley, no other sounds' },
    { name: 'sparrows', dur: 3, text: 'A few house sparrows chirping briefly, small birds, slightly distant, no other sounds' },
    { name: 'shutter', dur: 3, text: 'Distant metal roller shutter being pulled down at a shop, faint, echoing along a street, no other sounds' },
    { name: 'car', dur: 6, text: 'A single car driving slowly past on a narrow city street, tyres on asphalt, engine idle low, heard from the pavement, no music' },
    { name: 'bus', dur: 6, text: 'A city bus pulling away a few streets away, distant engine rumble swelling then fading, no other sounds' },
    { name: 'scooter', dur: 5, text: 'A moped scooter passing on a street a block away, small engine buzz rising and fading into the distance, no other sounds' },
    { name: 'horn', dur: 3, text: 'A short car horn beep several streets away in a city, distant and echoing, no other sounds' },
    { name: 'passersby', dur: 5, text: 'Two people chatting quietly as they walk past the far end of a lane, muffled words and footsteps, distant, no music' },
    { name: 'trolley', dur: 4, text: 'A delivery trolley with small wheels rattling over paving stones some distance away, echoing, no other sounds' },
    { name: 'dog', dur: 3, text: 'A dog barking twice far away across a few streets, distant and echoing, no other sounds' },
    { name: 'gull', dur: 3, text: 'A single seagull calling high above a city, distant, no other sounds' },
    { name: 'van', dur: 6, text: 'A delivery van idling and then pulling away on a nearby city street, low diesel engine, slightly distant, no other sounds' },
    { name: 'laugh', dur: 3, text: 'Distant burst of laughter from a small group outside a pub across the street, muffled, no music' },
    // the tap effect
    { name: 'fx-burn', dur: 4, text: 'A deep soft whoosh of fire igniting and racing outward in a wave, a brief roar of flame then crackling embers fizzing and fading away, cinematic, no music' },
    { name: 'fx-restore', dur: 3.5, text: 'A rising shimmering reverse whoosh with glassy crystalline sparkles, magical reassembly, airy and bright, cinematic, no music' }
];

// only needed when a sound isn't cached yet
let apiKey = null;
const key = () => (apiKey ??= process.env.ELEVENLABS_API_KEY ?? readFileSync(KEY_FILE, 'utf8').trim());

async function generate(s) {
    const rawPath = join(rawDir, `${s.name}.mp3`);
    if (existsSync(rawPath)) { console.log(`  ${s.name}: cached`); return rawPath; }
    for (let attempt = 1; attempt <= 3; attempt++) {
        const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
            method: 'POST',
            headers: { 'xi-api-key': key(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: s.text, duration_seconds: s.dur, prompt_influence: s.influence ?? 0.7 })
        });
        if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            writeFileSync(rawPath, buf);
            console.log(`  ${s.name}: generated (${(buf.length / 1024).toFixed(1)} KB)`);
            return rawPath;
        }
        const errText = await res.text();
        console.warn(`  ${s.name}: HTTP ${res.status} (attempt ${attempt}) ${errText.slice(0, 200)}`);
        if (attempt === 3) throw new Error(`Failed to generate ${s.name}`);
        await new Promise(r => setTimeout(r, res.status === 429 ? 4000 * attempt : 1500));
    }
}

const ff = args => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' });
const ffErr = args => spawnSync('ffmpeg', ['-hide_banner', ...args], { encoding: 'utf8' }).stderr ?? '';
const duration = p => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], { encoding: 'utf8' }));
const peakDb = p => parseFloat(/max_volume:\s*(-?[\d.]+) dB/.exec(ffErr(['-i', p, '-af', 'volumedetect', '-f', 'null', 'NUL']))?.[1] ?? '0');

// trims silence, fades the tail, peak-normalises to `peak` dB, mono 44.1 kHz
function oneShot(name, rawPath, peak = -3) {
    const trimmed = join(procDir, `${name}.wav`);
    ff(['-i', rawPath, '-af',
        'silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.02,areverse,' +
        'silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.05,afade=t=in:d=0.12,areverse',
        '-ac', '1', '-ar', '44100', trimmed]);
    const g = peak - peakDb(trimmed);
    const out = join(outDir, `${name}.mp3`);
    ff(['-i', trimmed, '-af', `volume=${g.toFixed(2)}dB`, '-codec:a', 'libmp3lame', '-q:a', '4', '-ac', '1', out]);
    return { name, dur: duration(out) };
}

const meanDb = p => parseFloat(/mean_volume:\s*(-?[\d.]+) dB/.exec(ffErr(['-i', p, '-af', 'volumedetect', '-f', 'null', 'NUL']))?.[1] ?? '0');

// a continuous texture: trimmed to its steady stretch (generations often fade in or out at the
// ends), stereo, set to a common average level. The app loops it with a crossfade.
function bed(name, rawPath, notch = [], mean = -24) {
    const wav = join(procDir, `${name}.wav`);
    const notches = notch.map(f => `bandreject=f=${f}:width_type=q:w=25`).join(',');
    ff(['-i', rawPath, ...(notches ? ['-af', notches] : []), '-ac', '2', '-ar', '44100', '-c:a', 'pcm_f32le', wav]);
    // quarter-second levels; keep from the first to the last window within 5 dB of the median
    const buf = readFileSync(wav);
    let off = 12, dataOff = 0, dataLen = 0;
    while (off < buf.length - 8) {
        const id = buf.toString('ascii', off, off + 4), len = buf.readUInt32LE(off + 4);
        if (id === 'data') { dataOff = off + 8; dataLen = len; break; }
        off += 8 + len;
    }
    const frames = dataLen / 8, win = 11025, lv = [];
    for (let s = 0; s + win <= frames; s += win) {
        let a = 0;
        for (let i = s; i < s + win; i++) { const l = buf.readFloatLE(dataOff + i * 8), r = buf.readFloatLE(dataOff + i * 8 + 4); a += l * l + r * r; }
        lv.push(10 * Math.log10(a / (2 * win) + 1e-20));
    }
    const med = [...lv].sort((p, q) => p - q)[lv.length >> 1];
    let a = 0, b = lv.length - 1;
    while (a < b && lv[a] < med - 5) a++;
    while (b > a && lv[b] < med - 5) b--;
    const t0 = a * 0.25, t1 = (b + 1) * 0.25;
    const g = mean - meanDb(wav);
    const out = join(outDir, `${name}.mp3`);
    ff(['-i', wav, '-af', `atrim=${t0}:${t1},asetpts=N/SR/TB,volume=${g.toFixed(2)}dB,alimiter=limit=0.7`, '-codec:a', 'libmp3lame', '-q:a', '5', '-ac', '2', out]);
    console.log(`  ${name}: steady ${t0.toFixed(2)}-${t1.toFixed(2)} s`);
    return { name, dur: duration(out) };
}

// finds step onsets in the take with an energy envelope, cuts each step, packs them into a sprite
function sliceSteps(rawPath) {
    const wav = join(procDir, `${STEPS.name}.wav`);
    ff(['-i', rawPath, '-ac', '1', '-ar', '44100', '-c:a', 'pcm_f32le', wav]);
    const buf = readFileSync(wav);
    // find the data chunk
    let off = 12, dataOff = 0, dataLen = 0;
    while (off < buf.length - 8) {
        const id = buf.toString('ascii', off, off + 4), len = buf.readUInt32LE(off + 4);
        if (id === 'data') { dataOff = off + 8; dataLen = len; break; }
        off += 8 + len;
    }
    const n = dataLen / 4, sr = 44100;
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = buf.readFloatLE(dataOff + i * 4);
    // 5 ms RMS envelope
    const hop = 220, env = [];
    for (let i = 0; i + hop <= n; i += hop) {
        let s = 0; for (let k = 0; k < hop; k++) s += x[i + k] * x[i + k];
        env.push(Math.sqrt(s / hop));
    }
    const peak = Math.max(...env);
    // steps alternate loud and soft feet (~10 dB apart), so pick envelope peaks that are the
    // maximum within +-0.2 s and above -26 dB of the loudest, then back up to the attack
    const win = Math.round(0.2 * sr / hop), floor = peak * Math.pow(10, -26 / 20);
    const onsets = [];
    for (let j = 1; j < env.length; j++) {
        if (env[j] < floor) continue;
        let isMax = true;
        for (let k = Math.max(0, j - win); k <= Math.min(env.length - 1, j + win); k++) if (env[k] > env[j]) { isMax = false; break; }
        if (!isMax) continue;
        let b = j; while (b > 0 && env[b - 1] > env[j] * 0.08 && (j - b) < 8) b--;
        const t = b * hop / sr;
        if (!onsets.length || t - onsets[onsets.length - 1] > 0.3) onsets.push(t);
    }
    console.log(`  steps: ${onsets.length} onsets at ${onsets.map(o => o.toFixed(2)).join(' ')}`);
    // cut each step up to 0.42 s, ending before the next one, then normalise them all to one peak
    const pieces = [];
    for (let i = 0; i < onsets.length; i++) {
        const a = Math.max(0, onsets[i] - 0.008);
        const b = Math.min(onsets[i] + 0.4, (onsets[i + 1] ?? 1e9) - 0.025, n / sr);
        if (b - a < 0.12) continue;
        const p = join(procDir, `step${String(i).padStart(2, '0')}.wav`);
        ff(['-i', wav, '-af', `atrim=${a.toFixed(4)}:${b.toFixed(4)},asetpts=N/SR/TB,afade=t=in:d=0.004,afade=t=out:st=${(b - a - 0.08).toFixed(4)}:d=0.08`, '-ar', '44100', '-ac', '1', p]);
        const pk = peakDb(p);
        if (pk < -40) continue;
        pieces.push({ path: p, dur: b - a, peak: pk });
    }
    // drop near-silent pieces; the app sets each step's level itself
    const top = Math.max(...pieces.map(p => p.peak));
    const keep = pieces.filter(p => p.peak > top - 24);
    const gap = join(procDir, 'gap.wav');
    ff(['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '0.25', gap]);
    const list = [];
    const map = [];
    let cursor = 0;
    for (const p of keep) {
        const norm = p.path.replace('.wav', '_n.wav');
        ff(['-i', p.path, '-af', `volume=${(-3 - p.peak).toFixed(2)}dB`, norm]);
        const d = duration(norm);
        list.push(`file '${norm.replace(/\\/g, '/')}'`, `file '${gap.replace(/\\/g, '/')}'`);
        map.push([+cursor.toFixed(4), +d.toFixed(4)]);
        cursor += d + 0.25;
    }
    const listPath = join(procDir, 'steps-list.txt');
    writeFileSync(listPath, list.join('\n'));
    const sprite = join(procDir, 'steps-sprite.wav');
    ff(['-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', sprite]);
    // ogg/opus would be smaller, but mp3 decodes everywhere; the sprite is read as decoded PCM so
    // encoder padding is accounted for by measuring the decoded start in the browser (see audio.js)
    ff(['-i', sprite, '-codec:a', 'libmp3lame', '-q:a', '3', '-ac', '1', join(outDir, 'steps.mp3')]);
    writeFileSync(join(outDir, 'steps.json'), JSON.stringify({ steps: map }));
    console.log(`  steps: kept ${keep.length} of ${pieces.length}`);
}

console.log('Generating sounds via ElevenLabs...');
const stepsRaw = await generate(STEPS);
sliceSteps(stepsRaw);
const events = {};
for (const e of EVENTS) {
    const raw = await generate(e);
    const r = oneShot(e.name, raw);
    events[e.name] = +r.dur.toFixed(3);
    console.log(`  ${e.name}: ${r.dur.toFixed(2)} s`);
}
writeFileSync(join(outDir, 'events.json'), JSON.stringify(events));
const beds = {};
for (const b of BEDS) {
    const raw = await generate(b);
    const r = bed(b.name, raw, b.notch);
    beds[b.name] = +r.dur.toFixed(3);
    console.log(`  ${b.name}: ${r.dur.toFixed(2)} s`);
}
writeFileSync(join(outDir, 'beds.json'), JSON.stringify(beds));
console.log('done');
