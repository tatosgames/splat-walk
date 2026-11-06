import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const source = path.resolve(process.argv[2] ?? '.performance/baseline-original');
const dest = path.resolve(process.argv[3] ?? 'docs/performance/baseline.md');
const m = JSON.parse(await readFile(path.join(source, 'manifest.json'), 'utf8'));
const f = n => Number.isFinite(n) ? n.toFixed(2) : 'n/d';
const rows = [];
for (const c of m.cases) {
    for (const [index, s] of (c.summary ?? []).entries()) {
        const label = c.summary.length > 1 ? `${c.name}, ciclo ${index + 1}` : c.name;
        rows.push(`| ${label} | ${c.backend} | ${f(s.renderedFps)} | ${f(s.intervalsMs.p95)} | ${f(s.cpuRenderMs.p95)} | ${f(s.gpuMs.p95)} | ${f(s.videoTicksMissedFraction * 100)}% | ${c.valid ? 'sì' : 'no'} |`);
    }
}
const loads = m.cases.filter(c => c.name.startsWith('loading-')).map(c => `| ${c.name} | ${f(c.readyMs / 1000)} | ${f(c.transferBytes / 1000000)} | ${c.error ?? '—'} |`);
const images = m.cases.filter(c => c.name.startsWith('capture-')).map(c => `- ${c.name}: ${c.pngIdentical ? 'PNG identiche nelle due acquisizioni' : 'acquisizioni diverse; confronto byte non superato'}.`);
const errors = m.cases.filter(c => c.error).map(c => `- ${c.name}: ${c.error}`);
const text = `# Misurazioni Splat Walk

Esecuzione: ${m.createdAt}. Suite: ${m.suite}, ripetizioni configurate: ${m.repeats}. Commit di riferimento: \`${m.commit}\`. Il manifest conserva anche modifiche locali e hash delle sorgenti: il commit da solo non identifica la build misurata.

Browser: ${m.browser}. CPU: ${m.cpu}. OS: ${m.os}. Il dispositivo grafico effettivo è registrato nei JSON di ciascuno scenario; l'inventario del browser comprende ${m.systemInfo?.devices?.map(d => d.deviceString || d.vendorString).join(', ')}.

## Rendering

Le righe riportano i segmenti continui dopo il warm-up, con i cicli separati nella prova termica. Rendering inviati dal motore, non presentazione fisica del display. I campioni GPU sono asincroni e possono ripetersi; CPU e GPU non vanno sommati. I dati di ogni ripetizione rimangono separati.

| Scenario | Backend | FPS renderizzati | Intervallo p95 ms | CPU render p95 ms | GPU p95 ms | Tick video persi | Misura valida |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
${rows.join('\n')}

## Caricamento

| Scenario | Pronto in s | Trasferimento MB | Errore |
| --- | ---: | ---: | --- |
${loads.join('\n') || '| Non ancora raccolto | — | — | — |'}

Le fasi di decodifica, upload e compilazione shader non isolate restano aggregate. La rete locale non rappresenta GitHub Pages: latenza e bandwidth simulate sono esplicite nei nomi. Il controllo della cache è confermato dai flag CDP nei JSON.

## Ripetibilità delle immagini

${images.join('\n') || 'Non ancora raccolta.'}

## Errori e limiti

${errors.join('\n') || 'Nessun errore di esecuzione registrato negli scenari completati.'}

I risultati dei telefoni reali sono in attesa dei dispositivi. Le viewport strette sul PC verificano layout e costo a quelle dimensioni, non certificano performance mobili. La memoria GPU è quella contabilizzata dal motore; la memoria PCM e lo heap JavaScript sono voci diverse. I JSON e le immagini originali restano nella cartella locale di esecuzione, esclusa da Git.
`;
await mkdir(path.dirname(dest), { recursive: true });
await writeFile(dest, text);
console.log(dest);
