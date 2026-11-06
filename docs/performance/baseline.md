# Misurazioni Splat Walk

Esecuzione: 2026-11-06T03:05:17.352Z. Suite: all, ripetizioni configurate: 3. Commit di riferimento: `8a140e75fb64043b9fa334eae2bc8230727cbdf8`. Il manifest conserva anche modifiche locali e hash delle sorgenti: il commit da solo non identifica la build misurata.

Browser: 156.0.8078.80. CPU: Intel(R) Core(TM) i7-10710U CPU @ 1.10GHz. OS: Windows_NT 10.0.26300 x64. Il dispositivo grafico effettivo è registrato nei JSON di ciascuno scenario; l'inventario del browser comprende Intel(R) UHD Graphics, NVIDIA GeForce GTX 1650 with Max-Q Design, Microsoft Basic Render Driver.

## Rendering

Le righe riportano i segmenti continui dopo il warm-up, con i cicli separati nella prova termica. Rendering inviati dal motore, non presentazione fisica del display. I campioni GPU sono asincroni e possono ripetersi; CPU e GPU non vanno sommati. I dati di ogni ripetizione rimangono separati.

| Scenario | Backend | FPS renderizzati | Intervallo p95 ms | CPU render p95 ms | GPU p95 ms | Tick video persi | Misura valida |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| webgpu-30-landscape-1 | webgpu | 10.16 | 223.40 | 2.30 | 189.40 | 66.14% | sì |
| webgpu-30-landscape-2 | webgpu | 9.81 | 239.40 | 2.60 | 200.21 | 67.15% | sì |
| webgpu-30-landscape-3 | webgpu | 9.62 | 243.20 | 2.60 | 199.75 | 67.97% | sì |
| webgpu-30-portrait-1 | webgpu | 15.09 | 166.60 | 2.10 | 135.53 | 49.70% | sì |
| webgpu-30-portrait-2 | webgpu | 13.63 | 178.70 | 2.60 | 155.32 | 54.59% | sì |
| webgpu-30-portrait-3 | webgpu | 13.78 | 170.60 | 2.60 | 140.38 | 54.08% | sì |
| webgpu-60-landscape-1 | webgpu | 7.88 | 310.00 | 4.10 | 255.00 | 85.87% | sì |
| webgpu-60-landscape-2 | webgpu | 8.46 | 284.70 | 3.40 | 250.35 | 85.69% | sì |
| webgpu-60-landscape-3 | webgpu | 7.02 | 328.60 | 4.30 | 268.70 | 87.27% | sì |
| webgpu-60-portrait-1 | webgpu | 13.53 | 199.10 | 4.00 | 184.81 | 74.34% | sì |
| webgpu-60-portrait-2 | webgpu | 14.63 | 202.30 | 3.60 | 177.60 | 75.55% | sì |
| webgpu-60-portrait-3 | webgpu | 12.35 | 233.30 | 4.00 | 211.55 | 77.64% | sì |
| webgl-30-landscape-1 | webgl2 | 3.62 | 790.00 | 394.50 | 423.59 | 85.88% | sì |
| webgl-30-landscape-2 | webgl2 | 4.19 | 737.60 | 372.50 | 397.67 | 85.81% | sì |
| webgl-30-landscape-3 | webgl2 | 3.70 | 780.80 | 408.70 | 408.34 | 85.27% | sì |
| webgl-30-portrait-1 | webgl2 | 4.81 | 602.30 | 324.70 | 351.02 | 82.49% | sì |
| webgl-30-portrait-2 | webgl2 | 4.85 | 615.80 | 320.50 | 335.45 | 83.02% | sì |
| webgl-30-portrait-3 | webgl2 | 5.21 | 654.70 | 333.70 | 345.60 | 81.33% | sì |
| webgl-60-landscape-1 | webgl2 | 4.98 | 606.80 | 324.90 | 330.19 | 91.70% | sì |
| webgl-60-landscape-2 | webgl2 | 5.23 | 550.40 | 275.80 | 294.39 | 91.32% | sì |
| webgl-60-landscape-3 | webgl2 | 5.19 | 572.80 | 303.80 | 298.39 | 91.35% | sì |
| webgl-60-portrait-1 | webgl2 | 5.81 | 527.70 | 262.20 | 269.69 | 90.30% | sì |
| webgl-60-portrait-2 | webgl2 | 6.18 | 505.00 | 252.00 | 263.84 | 89.72% | sì |
| webgl-60-portrait-3 | webgl2 | 6.21 | 494.10 | 250.40 | 265.19 | 89.65% | sì |
| diagnostic-webgpu-1-10-1 | webgpu | 4.56 | 308.70 | 2.30 | 249.56 | 92.40% | sì |
| diagnostic-webgpu-1-10-2 | webgpu | 4.45 | 343.20 | 2.40 | 255.39 | 92.59% | sì |
| diagnostic-webgpu-1-10-3 | webgpu | 4.43 | 322.20 | 2.90 | 261.62 | 92.62% | sì |
| diagnostic-webgpu-1-6-1 | webgpu | 4.48 | 339.50 | 2.50 | 267.71 | 92.54% | sì |
| diagnostic-webgpu-1-6-2 | webgpu | 4.68 | 308.80 | 2.50 | 252.18 | 92.21% | sì |
| diagnostic-webgpu-1-6-3 | webgpu | 4.72 | 305.80 | 2.30 | 242.75 | 92.13% | sì |
| diagnostic-webgpu-1-4-1 | webgpu | 4.69 | 318.90 | 2.50 | 246.94 | 92.19% | sì |
| diagnostic-webgpu-1-4-2 | webgpu | 4.74 | 288.10 | 2.30 | 244.32 | 92.11% | sì |
| diagnostic-webgpu-1-4-3 | webgpu | 4.67 | 313.00 | 2.90 | 251.79 | 92.22% | sì |
| diagnostic-webgpu-0.5-10-1 | webgpu | 6.21 | 275.00 | 2.60 | 201.06 | 89.65% | sì |
| diagnostic-webgpu-0.5-10-2 | webgpu | 6.43 | 264.70 | 2.50 | 190.51 | 89.28% | sì |
| diagnostic-webgpu-0.5-10-3 | webgpu | 6.48 | 262.30 | 2.60 | 186.78 | 89.22% | sì |
| diagnostic-webgpu-0.5-6-1 | webgpu | 6.50 | 258.10 | 2.50 | 183.76 | 89.18% | sì |
| diagnostic-webgpu-0.5-6-2 | webgpu | 6.63 | 256.10 | 2.90 | 188.74 | 88.96% | sì |
| diagnostic-webgpu-0.5-6-3 | webgpu | 6.66 | 236.80 | 2.20 | 182.52 | 88.91% | sì |
| diagnostic-webgpu-0.5-4-1 | webgpu | 6.59 | 263.30 | 2.80 | 193.00 | 89.02% | sì |
| diagnostic-webgpu-0.5-4-2 | webgpu | 7.05 | 242.20 | 2.40 | 176.49 | 88.25% | sì |
| diagnostic-webgpu-0.5-4-3 | webgpu | 6.89 | 242.30 | 2.40 | 173.67 | 88.52% | sì |
| diagnostic-webgl-1-10-1 | webgl2 | 3.19 | 860.70 | 661.30 | 430.09 | 94.88% | sì |
| diagnostic-webgl-1-10-2 | webgl2 | 3.44 | 756.70 | 411.20 | 364.34 | 94.45% | sì |
| diagnostic-webgl-1-10-3 | webgl2 | 3.47 | 663.00 | 422.30 | 330.53 | 94.28% | sì |
| diagnostic-webgl-1-6-1 | webgl2 | 3.58 | 737.20 | 422.90 | 347.99 | 94.14% | sì |
| diagnostic-webgl-1-6-2 | webgl2 | 3.52 | 676.20 | 359.20 | 347.26 | 94.19% | sì |
| diagnostic-webgl-1-6-3 | webgl2 | 3.55 | 825.40 | 380.00 | 334.51 | 94.08% | sì |
| diagnostic-webgl-1-4-1 | webgl2 | 3.41 | 673.30 | 403.40 | 386.08 | 94.34% | sì |
| diagnostic-webgl-1-4-2 | webgl2 | 3.30 | 861.20 | 402.00 | 369.72 | 94.43% | sì |
| diagnostic-webgl-1-4-3 | webgl2 | 2.91 | 898.10 | 473.90 | 454.67 | 95.23% | sì |
| diagnostic-webgl-0.5-10-1 | webgl2 | 3.09 | 793.50 | 402.10 | 405.63 | 94.95% | sì |
| diagnostic-webgl-0.5-10-2 | webgl2 | 3.22 | 855.40 | 390.90 | 401.56 | 94.46% | sì |
| diagnostic-webgl-0.5-10-3 | webgl2 | 3.97 | 618.60 | 327.40 | 312.89 | 93.31% | sì |
| diagnostic-webgl-0.5-6-1 | webgl2 | 3.71 | 757.10 | 446.30 | 365.58 | 93.82% | sì |
| diagnostic-webgl-0.5-6-2 | webgl2 | 3.70 | 655.40 | 388.10 | 337.69 | 93.91% | sì |
| diagnostic-webgl-0.5-6-3 | webgl2 | 4.04 | 612.60 | 331.70 | 316.76 | 93.42% | sì |
| diagnostic-webgl-0.5-4-1 | webgl2 | 4.07 | 654.60 | 374.50 | 343.24 | 93.23% | sì |
| diagnostic-webgl-0.5-4-2 | webgl2 | 3.73 | 668.70 | 394.40 | 329.04 | 93.82% | sì |
| diagnostic-webgl-0.5-4-3 | webgl2 | 4.22 | 672.20 | 381.60 | 311.37 | 93.21% | sì |
| burn-webgpu | webgpu | 5.73 | 277.30 | 2.80 | 215.94 | 90.46% | sì |
| burn-webgl | webgl2 | 3.85 | 616.40 | 348.20 | 321.27 | 93.58% | sì |
| thermal-60, ciclo 1 | webgpu | 10.16 | 214.30 | 2.30 | 186.97 | 83.06% | sì |
| thermal-60, ciclo 2 | webgpu | 9.80 | 213.70 | 2.20 | 181.86 | 83.66% | sì |
| thermal-60, ciclo 3 | webgpu | 10.00 | 223.60 | 2.40 | 185.01 | 83.34% | sì |
| thermal-60, ciclo 4 | webgpu | 9.88 | 219.30 | 2.50 | 183.89 | 83.51% | sì |
| thermal-60, ciclo 5 | webgpu | 6.82 | 259.30 | 2.80 | 217.25 | 88.62% | sì |

## Caricamento

| Scenario | Pronto in s | Trasferimento MB | Errore |
| --- | ---: | ---: | --- |
| loading-native-cold | 18.81 | 81.94 | — |
| loading-native-warm | 19.19 | 78.44 | — |
| loading-10mbps-cold | 82.67 | 81.94 | — |
| loading-10mbps-warm | 81.24 | 78.39 | — |

Le fasi di decodifica, upload e compilazione shader non isolate restano aggregate. La rete locale non rappresenta GitHub Pages: latenza e bandwidth simulate sono esplicite nei nomi. Il controllo della cache è confermato dai flag CDP nei JSON.

## Ripetibilità delle immagini

- capture-start: acquisizioni diverse; confronto byte non superato.
- capture-narrow: acquisizioni diverse; confronto byte non superato.
- capture-middle: acquisizioni diverse; confronto byte non superato.
- capture-turn: acquisizioni diverse; confronto byte non superato.
- capture-exit: acquisizioni diverse; confronto byte non superato.
- capture-burn: acquisizioni diverse; confronto byte non superato.
- capture-restore: acquisizioni diverse; confronto byte non superato.

## Errori e limiti

Nessun errore di esecuzione registrato negli scenari completati.

I risultati dei telefoni reali sono in attesa dei dispositivi. Le viewport strette sul PC verificano layout e costo a quelle dimensioni, non certificano performance mobili. La memoria GPU è quella contabilizzata dal motore; la memoria PCM e lo heap JavaScript sono voci diverse. I JSON e le immagini originali restano nella cartella locale di esecuzione, esclusa da Git.
