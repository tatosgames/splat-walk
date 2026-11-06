# Decisioni e limiti della versione mobile

## Dati e qualita

Il dataset originale resta disponibile: 4.999.591 Gaussiane, tre bande SH, cinque chunk,
79.577.556 byte. Non sono cinque livelli LOD. La variante predefinita contiene 250.000
Gaussiane, zero bande SH e occupa 3.124.504 byte: riduzione del 96,1% dei byte della scena.
Balanced contiene un milione di Gaussiane, una banda SH e occupa 14.490.298 byte.

Il PLY originale non era nel repository. La conversione parte dal SOG gia compresso;
nessuna ricostruzione recupera la precisione persa. Il download SuperSplat richiedeva
un account separato. Le ricette complete, inclusi intermedi e hash, sono in
[scene-recipes.json](scene-recipes.json). Il manifest pubblico contiene solo le varianti
selezionate, mentre candidati e PLY di lavoro restano fuori dal bundle.

Sono stati generati anche 500K SH0 (6.155.509 byte), 500K SH1 (7.571.208 byte) e 2M SH1
(28.258.740 byte). La coppia 500K permette di isolare la perdita dovuta alle armoniche
sulla stessa geometria. Il confronto degli archivi conferma byte identici per posizioni, rotazioni, scale e SH0; nel manifest cambia solo shN e si aggiungono le due texture SH1. I dati sono in [harmonic-comparison-data.json](harmonic-comparison-data.json). La generazione di un candidato non ne certifica la qualita.
Non sono stati rimossi volumi lontani in base alle sole statistiche: potrebbero entrare
nelle viste laterali della camera.

## Rendering

Performance limita separatamente uscita (896 px lato lungo, 451.584 pixel, DPR 1,5) e
render target della scena (scala dinamica 0,5-1). Quattro campioni temporali condividono
la lettura RGB: il profilo leggero rinuncia all'aberrazione cromatica laterale, conservando
esposizione, rolling shutter, aloni, sharpening, vignettatura e grana. Il cutoff forward
0,02 evita le code quasi trasparenti. Balanced e Original mantengono i tre raggi colore.
Gli shader GLSL e WGSL implementano gli stessi cambiamenti.

Il sorting predefinito resta quello del motore: GPU su WebGPU, CPU su WebGL. Sul PC Intel
lo smoke WebGPU con CPU sorting ha prodotto circa 45 fps contro circa 52 con GPU sorting
alla precedente uscita 1024 px. Non e stato promosso a ottimizzazione. Ridurre l'uscita
a 768 px ha prodotto circa 56 fps, quasi come i 55-56 a 896 px, perdendo dettaglio:
896 px e il compromesso mantenuto. Questi smoke di sei secondi orientano la scelta,
non dimostrano 60 fps stabili.

Il benchmark iniziale del profilo leggero usa 32 frame invece di 60 e inizia da scala 0,7.
Il SOG unico richiede tre frame di disponibilita stabile invece dei venti dello streaming
originale. Il dettaglio minimo e gia la scena completa del profilo: nessun upgrade nascosto
scarica il dataset originale. I suoni si caricano dopo il gesto e non bloccano Play.

## Verifiche visive e funzionali

La verifica su Chrome ha coperto 320x568, 390x844, 412x915, 844x390, 768x1024 e 1280x720,
con schermata iniziale e pausa. Portrait renderizza al rapporto effettivo. Controlli
alti almeno 44 px e rientranti nel viewport; a 320 px la qualita occupa una seconda riga.
Sono state ispezionate le viste yaw -60/+60 e pitch -30/+30 a t=16. Pareti vicine e
insegne perdono dettaglio nel preset leggero: e una riduzione visibile, non equivalenza
alla scena originale. Nessun nuovo vuoto evidente nelle quattro viste esaminate;
questa osservazione non copre ogni combinazione di tempo e angolo.

Mouse e touch CDP hanno verificato drag in pausa, ricentra, multitouch senza burn,
tap con burn e cambio viewport. Altri controlli hanno verificato audio reale del browser,
pausa/ripresa, fine e replay, errore scena e retry. Il test di visibilitychange e sintetico:
l'automazione manteneva visibili entrambe le finestre. Background reale, notch, barre
dinamiche e gesture fisiche su Android/iPhone rimangono nella
[procedura device](mobile-validation.md).

Le acquisizioni duplicate originali non sono byte identiche nonostante posa, rumore e
tempo effetto bloccati. A t=16 differiscono 34.828 pixel su 921.600, principalmente di
un livello; il massimo osservato e 24. Il gate byte non e superato. Per le modifiche
lossy si usa quindi un confronto affiancato; non viene inventata una soglia di qualita.

## Criteri di rilascio

Il 6 novembre il target e stato aggiornato a 50 fps su richiesta dell'utente. I 60 fps restano un obiettivo successivo. Il budget corrente e GPU/CPU p95 entro 17 ms, tick persi sotto l'1% e intervallo p99
entro 40 ms. Un run valido significa che la misura e completa e visibile, non che
questi budget siano superati. Auto dichiara 30 fps dopo sovraccarico persistente;
il fallback mantiene l'esperienza utilizzabile ma non soddisfa il target 50.
La matrice con fps esplicito mantiene il target richiesto per rendere visibili i fallimenti.

I risultati PC non certificano una GPU mobile. Non sono stati forniti telefoni di
riferimento, quindi non si dichiara completata la validazione Android/iPhone.
