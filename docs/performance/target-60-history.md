# Misure storiche del target 60

L'utente ha accettato 50 fps per questa versione. Questa esecuzione e stata interrotta volontariamente dopo la matrice completa di 24 giri e parte delle diagnostiche; non e una suite completa. Il nuovo target viene verificato separatamente a 50 fps.

Esecuzione: 2026-11-06T04:49:45.626Z. Suite: all, ripetizioni configurate: 3. Commit di riferimento: `8a140e75fb64043b9fa334eae2bc8230727cbdf8`. Il manifest conserva anche modifiche locali e hash delle sorgenti: il commit da solo non identifica la build misurata.

Browser: 156.0.8078.80. CPU: Intel(R) Core(TM) i7-10710U CPU @ 1.10GHz. OS: Windows_NT 10.0.26300 x64. Il dispositivo grafico effettivo è registrato nei JSON di ciascuno scenario; l'inventario del browser comprende Intel(R) UHD Graphics, NVIDIA GeForce GTX 1650 with Max-Q Design, Microsoft Basic Render Driver.

## Rendering

Le righe riportano i segmenti continui dopo il warm-up, con i cicli separati nella prova termica. Rendering inviati dal motore, non presentazione fisica del display. I campioni GPU sono asincroni e possono ripetersi; CPU e GPU non vanno sommati. I dati di ogni ripetizione rimangono separati.

| Scenario | Backend | FPS renderizzati | Intervallo p95 ms | CPU render p95 ms | GPU p95 ms | Tick video persi | Misura valida |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| webgpu-30-landscape-1 | webgpu | 29.73 | 47.30 | 2.90 | 23.46 | 0.81% | sì |
| webgpu-30-landscape-2 | webgpu | 30.00 | 41.30 | 2.00 | 26.08 | 0.00% | sì |
| webgpu-30-landscape-3 | webgpu | 30.00 | 42.40 | 2.10 | 25.17 | 0.00% | sì |
| webgpu-30-portrait-1 | webgpu | 30.00 | 36.40 | 0.90 | 21.36 | 0.00% | sì |
| webgpu-30-portrait-2 | webgpu | 29.90 | 36.40 | 0.90 | 20.71 | 0.22% | sì |
| webgpu-30-portrait-3 | webgpu | 30.00 | 43.40 | 1.50 | 23.72 | 0.00% | sì |
| webgpu-60-landscape-1 | webgpu | 54.94 | 26.20 | 2.40 | 17.30 | 8.44% | sì |
| webgpu-60-landscape-2 | webgpu | 54.65 | 26.10 | 2.70 | 17.83 | 8.90% | sì |
| webgpu-60-landscape-3 | webgpu | 54.92 | 28.20 | 2.50 | 17.63 | 8.47% | sì |
| webgpu-60-portrait-1 | webgpu | 55.27 | 23.90 | 2.40 | 16.58 | 7.87% | sì |
| webgpu-60-portrait-2 | webgpu | 55.58 | 22.50 | 2.30 | 16.71 | 7.36% | sì |
| webgpu-60-portrait-3 | webgpu | 54.99 | 25.50 | 2.30 | 16.52 | 8.36% | sì |
| webgl-30-landscape-1 | webgl2 | 30.00 | 40.30 | 1.00 | 22.63 | 0.00% | sì |
| webgl-30-landscape-2 | webgl2 | 30.01 | 36.40 | 0.70 | 20.29 | 0.00% | sì |
| webgl-30-landscape-3 | webgl2 | 30.00 | 36.40 | 0.90 | 24.30 | 0.00% | sì |
| webgl-30-portrait-1 | webgl2 | 30.00 | 36.80 | 0.90 | 21.82 | 0.00% | sì |
| webgl-30-portrait-2 | webgl2 | 30.01 | 36.30 | 0.90 | 20.89 | 0.00% | sì |
| webgl-30-portrait-3 | webgl2 | 30.00 | 36.30 | 0.70 | 17.66 | 0.00% | sì |
| webgl-60-landscape-1 | webgl2 | 56.59 | 18.30 | 0.70 | 11.33 | 5.68% | sì |
| webgl-60-landscape-2 | webgl2 | 56.31 | 18.40 | 0.70 | 13.84 | 6.17% | sì |
| webgl-60-landscape-3 | webgl2 | 56.02 | 18.50 | 0.90 | 14.74 | 6.65% | sì |
| webgl-60-portrait-1 | webgl2 | 56.52 | 18.30 | 0.60 | 12.28 | 5.82% | sì |
| webgl-60-portrait-2 | webgl2 | 55.29 | 22.90 | 1.00 | 14.17 | 7.85% | sì |
| webgl-60-portrait-3 | webgl2 | 55.30 | 24.70 | 1.00 | 13.63 | 7.84% | sì |
| diagnostic-webgpu-1-10-1 | webgpu | 32.35 | 54.10 | 3.80 | 33.88 | 46.11% | sì |
| diagnostic-webgpu-1-10-2 | webgpu | 40.21 | 44.80 | 1.50 | 27.72 | 32.96% | sì |
| diagnostic-webgpu-1-10-3 | webgpu | 32.60 | 54.70 | 2.80 | 33.23 | 45.65% | sì |
| diagnostic-webgpu-1-6-1 | webgpu | 45.31 | 38.60 | 1.30 | 23.99 | 24.47% | sì |
| diagnostic-webgpu-1-6-2 | webgpu | 44.19 | 39.70 | 1.70 | 27.00 | 26.32% | sì |
| diagnostic-webgpu-1-6-3 | webgpu | 45.36 | 39.40 | 1.30 | 23.86 | 24.37% | sì |
| diagnostic-webgpu-1-4-1 | webgpu | 47.20 | 36.90 | 1.40 | 23.53 | 21.30% | sì |
| diagnostic-webgpu-1-4-2 | webgpu | 46.87 | 37.30 | 1.30 | 23.92 | 21.98% | sì |
| diagnostic-webgpu-1-4-3 | webgpu | 46.04 | 38.50 | 1.40 | 24.90 | 23.24% | sì |
| diagnostic-webgpu-0.5-10-1 | webgpu | 56.54 | 18.40 | 1.20 | 15.73 | 5.75% | sì |
| diagnostic-webgpu-0.5-10-2 | webgpu | 56.75 | 18.30 | 1.10 | 14.42 | 5.37% | sì |
| diagnostic-webgpu-0.5-10-3 | webgpu | 56.33 | 18.60 | 1.30 | 15.60 | 6.10% | sì |
| diagnostic-webgpu-0.5-6-1 | webgpu | 56.23 | 18.60 | 1.40 | 14.09 | 6.29% | sì |
| diagnostic-webgpu-0.5-6-2 | webgpu | 56.14 | 18.70 | 1.70 | 16.19 | 6.39% | sì |
| diagnostic-webgpu-0.5-6-3 | webgpu | 56.16 | 18.50 | 1.40 | 14.75 | 6.38% | sì |
| diagnostic-webgpu-0.5-4-1 | webgpu | 56.22 | 18.60 | 1.00 | 11.99 | 6.29% | sì |
| diagnostic-webgpu-0.5-4-2 | webgpu | 56.43 | 18.50 | 0.90 | 10.49 | 5.93% | sì |

## Caricamento

| Scenario | Pronto in s | Trasferimento MB | Errore |
| --- | ---: | ---: | --- |
| Non ancora raccolto | — | — | — |

Le fasi di decodifica, upload e compilazione shader non isolate restano aggregate. La rete locale non rappresenta GitHub Pages: latenza e bandwidth simulate sono esplicite nei nomi. Il controllo della cache è confermato dai flag CDP nei JSON.

## Ripetibilità delle immagini

Non ancora raccolta.

## Errori e limiti

Nessun errore di esecuzione registrato negli scenari completati.

I risultati dei telefoni reali sono in attesa dei dispositivi. Le viewport strette sul PC verificano layout e costo a quelle dimensioni, non certificano performance mobili. La memoria GPU è quella contabilizzata dal motore; la memoria PCM e lo heap JavaScript sono voci diverse. I JSON e le immagini originali restano nella cartella locale di esecuzione, esclusa da Git.
