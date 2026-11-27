# Imposter Dance

OpenScrapp für lokales Mehrspieler. Drei bis beliebig viele Personen, jede mit eigenem Handy und eigenen Kopfhörern. Alle hören denselben 10-Sekunden-Schnipsel und tanzen. Eine Person ist der Imposter und hört nur die Ansage „Du bist der Imposter“, danach Stille. Anschließend stimmt die Runde ab, wie bei Werwolf.

Die Oberfläche ist deutsch. Der Host ist ein Android-Handy mit OpenScr. Weitere Personen kommen per QR dazu, auch im Browser. iOS ist vorerst nur Browser-Gast, weil die Mehrspieler-Bridge auf iOS fehlt.

## In OpenScr hinzufügen

1. OpenScr auf Android öffnen.
2. Die OpenScrapp hinzufügen:

```
https://github.com/Krust3nKaese3/ImposterDanceScrapp
```

3. Die Berechtigungen **storage**, **multiplayer** und **http** bestätigen. `http` ist für `net.fetch` in Add-ons.

Dieselbe Seite läuft im Host-WebView und im Browser der Gäste. OpenScr setzt `OpenScrRoster` und `OpenScrQr` ein. Die OpenScrapp nutzt diese gemeinsamen Flächen für die Namensliste und die Einladung.

## Ablauf

1. Namen aus der gemeinsamen Spielerliste setzen. Mindestens drei.
2. **Einladen** öffnet die QR-Seite von OpenScr (WLAN oder Hotspot).
3. Jede Person wählt auf dem eigenen Handy, wer sie ist.
4. Der Host wählt eine oder mehrere MP3-Dateien vom eigenen Handy. Pro Datei gilt ein fester Start oder ein zufälliger Start im Stück.
5. **Runde vorbereiten** schneidet 10 Sekunden, baut die Imposter-Ansage auf dieselbe Größe und schickt das Paket vollständig an die anderen Handys. Es wird nichts gestreamt.
6. Jede Person tippt **Bereit**. Das gibt den Ton frei und fordert einen Wake Lock an. Solange jemand noch lädt, bleibt **Abspielen** aus.
7. Zur verabredeten Host-Zeit starten alle. Nach 10 Sekunden endet der Ton.
8. Abstimmung ohne feste Reihenfolge: alle Namen stehen da, jede Person tippt den eigenen Namen und dann einen Verdacht. **Zurück** nimmt die Auswahl zurück und verbraucht den Zug nicht. Liegt nur ein Handy herum, geht dieselbe Liste von Hand zu Hand.
9. Die meisten Stimmen fliegen raus. Gleichstand heißt: der Imposter entkommt. Erwischt: jede andere Person bekommt einen Punkt. Entkommen: nur der Imposter bekommt einen Punkt.
10. **Nächste Runde** schneidet den nächsten Schnipsel. Während der Abstimmung hat der Host ihn schon vorbereitet.

## Ton

Der Host dekodiert die MP3 im WebView und verteilt 16 kHz mono mu-law, genau 160012 Bytes, Ansage und Song gleich lang. Die Ansage ist eine deutsche eSpeak-Aufnahme plus Stille. Bluetooth darf 0,1–0,3 s hinterherhinken. Die Uhren werden wie bei NTP abgeglichen, gespielt wird über die Uhr des AudioContext.

Liegen `files.pickAudio`, `audio.cut`, `audio.schedulePlay` und `multiplayer.sendBinary` auf der Bridge, nutzt der Host sie. Sonst bleiben Dateidialog, lokaler Schnitt, JSON-Stücke und die AudioContext-Uhr. Die Ansage entsteht weiter hier. Der Uhrabgleich bleibt Ping/Pong, weil `clock.sync` nur die lokale Uhr ist. Details in [docs/BRIDGE_NEEDS.md](docs/BRIDGE_NEEDS.md). Add-ons: [docs/ADDONS.md](docs/ADDONS.md).

## Speicher

| Schlüssel | Inhalt |
| --- | --- |
| `imposterdance.lobby.v1` | `{"v":1,"seated":[…]}` |

Die Audiodaten bleiben im Speicher der Sitzung. Ein Schlüssel der Bridge fasst höchstens 256 KiB, das Paket plus die Quelldatei passen da nicht hinein.

## Tests

```
npm test
npm run check
```

`npm test` prüft Abstimmung, Punktestand, Uhrabgleich, gleiche Clip-Länge, den MULW-Kopf, das Megabyte-Fenster, die Ansage, das Zerlegen der Pakete unter 32 KiB und das Add-on-Format. `players.js` ist die gemeinsame Spielerliste aus Song raten.
