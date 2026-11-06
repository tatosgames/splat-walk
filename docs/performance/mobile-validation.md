# Verifica sui telefoni reali

Stato: in attesa di misure sui dispositivi. La disponibilità della pagina benchmark non equivale a un test mobile completato.

Aprire [la pagina di benchmark](https://tatosgames.github.io/splat-walk/benchmark.html) dopo il deploy. Prima di ogni esecuzione indicare modello, browser, versione del sistema e condizioni di alimentazione/rete. Non includere dati personali nelle note.

| Dispositivo | Modello e OS | Browser | Portrait tre giri | Landscape tre giri | Burn e ripristino | Cinque minuti | JSON |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Android | Da indicare | Chrome | Da fare | Da fare | Da fare | Da fare | Da raccogliere |
| iPhone | Da indicare | Safari | Da fare | Da fare | Da fare | Da fare | Da raccogliere |

## Procedura

1. Impostare lo schermo a 60 Hz se il dispositivo lo permette, disattivare il risparmio energetico e annotare le condizioni. Non eseguire il test durante altri carichi pesanti.
2. Selezionare 50 fps e backend automatico nella pagina benchmark. Applicare e ricaricare; scegliere Passeggiata per tre ripetizioni. Mantenere la pagina visibile.
3. Esportare il JSON, ruotare il telefono e ripetere. Registrare il backend realmente usato: WebGPU può non essere disponibile.
4. Eseguire lo scenario Burn e ripristino, poi la sessione di cinque minuti. Annotare surriscaldamento, crash e peggioramento visibile.
5. Nella demo principale verificare drag e tap separatamente, due dita, annullamento del gesto, ricentra, pausa durante il drag e rotazione del telefono. Controllare notch, barre del browser, pulsanti e crediti.
6. Per cache fredda usare gli strumenti del browser quando disponibili; non chiamare una misura cold soltanto perché si è ricaricata la pagina. Le limitazioni vanno annotate.

## Criteri

Il target corrente di 50 fps richiede misure coerenti per l'intera passeggiata e l'interazione, non una media favorevole di pochi secondi. Confrontare p95/p99, tick persi, dimensioni effettive e backend. GPU timing mancante resta non disponibile; una viewport mobile emulata sul PC non sostituisce questa tabella.

Se il profilo Auto mostra 30 fps per limite del dispositivo, la demo resta utilizzabile ma il requisito 50 fps su quel telefono non è superato. Eventuali artefatti introdotti dalla riduzione delle Gaussiane vanno descritti per posa e angolo di visuale, oltre alla velocità.
