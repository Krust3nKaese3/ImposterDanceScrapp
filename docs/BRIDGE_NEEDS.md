# OpenScr-Bridge und Fallbacks

Imposter Dance nutzt die neutralen Methoden aus OpenScr, sobald sie auf `OpenScrBridge` liegen. Fehlen sie (ältere Version, oder iOS), bleibt der bisherige Weg im WebView.

## Vorhanden, mit Erkennung

| Methode | Wann | Fallback |
| --- | --- | --- |
| `files.pickAudio({ accept, multiple })` | Android und Web | `<input type="file">` |
| `audio.cut({ bytes, startMs, durationMs, targetBytes })` | Android und Web | Dekodieren mit `AudioContext`, eigenes MULW-Paket |
| `audio.schedulePlay({ bytes, startAtMs, durationMs })` und `audio.stop()` | Android und Web | Start über die Uhr von `AudioContext` |
| `multiplayer.sendBinary({ to, bytes, id })`, `onBinary`, `onBinaryProgress` | Android, Web-Host, Browser-Gäste | Base64-Stücke zu 18000 Bytes über `multiplayer.send`, sechs Nachrichten, dann 800 ms |
| `net.fetch(url, { binary, chunked })` | überall, wo HTTP erlaubt ist, auch iOS | `fetch` im Browser, an Add-ons als `ImposterAddon.net.fetch` |

`audio.cut` und die eigene Ansage schreiben 16 kHz mono mu-law mit Kopf `MULW`, Abtastrate und Dauer in Millisekunden. 10 Sekunden sind 160012 Bytes. Die Ansage entsteht weiter in dieser OpenScrapp. `audio.speak` gibt es nicht.

`sendBinary` nimmt bis 256 KiB. Die Bridge stückelt mit 12000 Bytes. Zusätzlich gelten 1 MiB Binärdaten in 10 Sekunden und 80 Nachrichten in 10 Sekunden. Der Host schickt gezielt an jedes andere Gerät, immer die gleiche Länge, in fester Namensreihenfolge, und wartet nur, wenn das Megabyte-Fenster voll ist. Der Ladefortschritt steht in der Bereit-Anzeige.

## Uhr

`clock.sync()` ist nur die lokale `Date.now()`-Uhr. Der Ping/Pong-Abgleich bleibt. `schedulePlay` bekommt den Host-Zeitpunkt minus diesen Offset, also eine Zeit der WebView-Uhr.

## Weiterhin offen

`schedulePlay` plant in der WebView, nicht in einem nativen Player. Eine Toleranz von 100 ms inklusive Bluetooth-Puffer ist damit nicht garantiert. Auf iOS fehlen Dateiauswahl, Schnitt, geplantes Abspielen, Binärnachrichten und Add-ons.
