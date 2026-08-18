# Night Heist Escape

Gioco browser 2D top-down progettato per GitHub Pages. Nessun framework, nessuna build, nessuna dipendenza esterna.

## Gameplay

- Sei alla guida dell'auto dei ladri dopo un colpo.
- La polizia ti insegue e ti arresta se rimane abbastanza vicina.
- Le strade sono quasi invisibili al buio e diventano leggibili dentro i fari di tutti i veicoli.
- Ogni tratto presenta bivi con rischi differenti: traffico lento, veicoli in senso opposto, curve strette o strada libera.
- Quattro ambienti cambiano carreggiata, visibilità, traffico, aggressività della polizia e distanza necessaria alla fuga.
- La strada, il traffico e lo scenario sono generati proceduralmente.

## Controlli

- `W` / `Freccia su`: accelera
- `S` / `Freccia giù`: frena / retromarcia
- `A` / `D`: sterza
- `Spazio`: freno a mano
- `P`: pausa
- `R`: riprova dopo la fine della corsa

## Avvio locale

Essendo un progetto statico puoi aprirlo con un piccolo server HTTP:

```bash
python3 -m http.server 8080
```

Poi visita `http://localhost:8080`.

> Per via dei moduli JavaScript è preferibile usare un server locale invece di aprire `index.html` direttamente come `file://`.

## Pubblicazione su GitHub Pages

1. Crea un repository GitHub.
2. Carica tutti i file mantenendo la struttura delle cartelle.
3. In **Settings → Pages**, scegli **Deploy from a branch**.
4. Seleziona il branch `main` e la cartella `/ (root)`.
5. Salva. GitHub pubblicherà il gioco come sito statico.

## Struttura

```text
night-heist-escape/
├── index.html
├── styles.css
├── README.md
└── src/
    └── game.js
```

## Idee per una versione ancora più “commerciale”

- Sprite e animazioni dedicate per 8–12 veicoli diversi.
- Sistema danni con carrozzeria, gomme, motore e scintille localizzate.
- Tattiche di polizia: posti di blocco, strisce chiodate, elicottero, SUV che speronano.
- Sistema “heat” persistente tra una missione e l'altra.
- Garage con upgrade a motore, fari, gomme, nitro e blindatura.
- Missioni con bottini differenti e condizioni di fuga diverse.
- Colonna sonora adattiva, doppler, radio della polizia e riverbero ambientale.
- Controlli touch/gamepad e vibrazione su dispositivi compatibili.
- Ghost replay, classifiche e seed giornaliero per sfide condivise.
- Effetti WebGL opzionali (bloom, distorsione da velocità, luci volumetriche) mantenendo un fallback Canvas 2D.

## Nota tecnica

Il prototipo usa Canvas 2D e Web Audio generativo. Gli effetti di illuminazione sono calcolati con una maschera di oscurità forata dai coni dei fari, quindi la strada viene davvero rivelata dinamicamente dai veicoli invece di essere semplicemente "scurita".
