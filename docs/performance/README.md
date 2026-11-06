# Benchmark di Splat Walk

`npm run perf:baseline` compila una copia immutabile della build in `.performance/<data>/site`, usa Chrome installato con GPU hardware e salva campioni e risultati nello stesso run. Non chiude browser o server già aperti. La porta 5187 deve essere libera. Non usare altri carichi GPU durante le misure.

## Comandi

```powershell
npm run perf:test
npm run perf:baseline -- --suite=smoke
npm run perf:baseline -- --suite=all --output=.performance/baseline-original
node tools/performance/report.mjs .performance/baseline-original docs/performance/baseline.md
```

Suite disponibili: `matrix`, `diagnostic`, `loading`, `burn`, `thermal`, `captures`, `smoke`, `interaction`, `qa` e `all`. `interaction` prova mouse e touch CDP; `qa` verifica sei viewport, limiti camera, audio, replay e retry della scena. La prova termica include cambi di orientamento della camera e burn ogni dieci secondi. `--repeats=3` è il default per matrice e diagnostica. Una suite completa richiede decine di minuti. Tenere Chrome visibile e il computer alimentato; non cambiare GPU o refresh durante il confronto.

I campioni sono conservati nei JSON, con hash degli asset e delle sorgenti nel manifest. `postrender` identifica i rendering; `frameend` serve solo a leggere le statistiche dopo il frame. Le query GPU possono arrivare in ritardo: i tempi GPU non sono attribuiti artificialmente al campione CPU contemporaneo. Valori assenti restano null. Per confermare un collo di bottiglia, confrontare gli stessi tratti a risoluzione e campionamento fissi.

## Telefoni reali

Aprire `/benchmark.html` dal proprio GitHub Pages, indicare modello e condizioni, selezionare FPS/backend e premere Applica prima di avviare. Eseguire tre passeggiate in portrait e tre in landscape, poi burn e sessione di cinque minuti. Tenere la scheda visibile: un'interruzione invalida la misura. Esportare i JSON separatamente per dispositivo e orientamento. Per fermare una sessione usare Ferma: il risultato resta disponibile ma è marcato non valido per un giro completo.

La pagina non invia telemetria: i risultati sono in memoria e vengono scaricati solo su richiesta. Gli URL nei JSON identificano gli asset caricati. Non pubblicare condizioni o note personali che non si desidera condividere. Il backend automatico può ripiegare su WebGL: controllare il backend effettivamente registrato.

## Acquisizioni

La suite `captures` ferma camera, rumore ed effetti, attende la stabilizzazione del renderer e acquisisce due PNG per posa. Nasconde gli overlay solo durante queste acquisizioni. Il confronto PNG identico è un primo controllo di determinismo; se fallisce, quantificare le differenze pixel e non dichiarare conservata l'immagine. Le modifiche lossy della scena richiedono confronto affiancato invece dell'identità pixel.

Le misure di caricamento separano cache fredda/calda e rete libera/10 Mbit/s con RTT 100 ms. Decodifica della scena, upload GPU e compilazione shader possono sovrapporsi: sono aggregate quando manca una misura affidabile separata. HTTP 200 e build riuscita non equivalgono a correttezza visiva.

## Risultati

La [baseline completa](baseline.md) comprende 74 scenari sulla GPU Intel UHD del PC. I dati delle singole ripetizioni restano separati. Non usare il nome della GPU NVIDIA presente nel computer per descrivere questi risultati: il contesto del browser usava Intel. La validazione sui telefoni resta descritta in [mobile-validation.md](mobile-validation.md).

`--query=profile=quality&shutter=0.0125&readout=0.016` permette un confronto col dataset e i tempi ottici originali. Le query aggiuntive vengono dopo quelle dello scenario: la prima occorrenza di un parametro ha precedenza. Non sovrascrivere FPS, scale o taps di una matrice; creare un run dedicato. `--output` dovrebbe sempre indicare una nuova cartella.

La prova termica ripete il percorso per cinque minuti, alterna offset yaw/pitch e innesca burn programmati. Questo esercita il renderer ma non sostituisce gesti umani o un test fisico dei sensori touch. I tempi GPU sono asincroni. Il benchmark separa i segmenti anche quando cambia il target FPS di Auto, per non attribuire i tick a una cadenza errata.

Per confrontare un candidato senza pubblicarlo, usare `--scene-file=.performance/scene-work/mobile-v1.sog` insieme a `--suite=captures` e `--query=profile=quality&shutter=0.0125&readout=0.016&taps=10`. Il runner copia il SOG solo nella build isolata del run e ne registra hash e dimensione. Ripetere con la stessa geometria e SH diversi per isolare il colore dalla decimazione.

Dopo il deploy, `node tools/performance/check-pages.mjs --output=.performance/pages-check` verifica la demo pubblicata in Chrome: rendering portrait, drag, audio, risorse HTTP, benchmark breve e cache fredda/calda a 10 Mbit/s. I JSON e le schermate restano locali. Questa verifica del sito pubblicato usa ancora la GPU del PC.
