# Fehlende OpenScr-Bridge für Imposter Dance

Imposter Dance läuft mit dem, was die Bridge heute kann: `multiplayer.*` (JSON, höchstens 32 KiB, etwa 80 Nachrichten in 10 Sekunden), `storage`, `players`, `keepAwake`, die gemeinsame Lobby `OpenScrRoster` und die QR-Seite `OpenScrQr`. Die Punkte unten fehlen. Die OpenScrapp ersetzt sie, soweit das im WebView geht. OpenScr selbst ist unverändert.

## Was die OpenScrapp ersatzweise tut

- MP3 wählen: `<input type="file">` im Host-WebView. Das ist kein Gerätedialog der Bridge und kann in einer WebView ohne Dateizugriff leer bleiben.
- Schneiden und die Ansage: der Host dekodiert mit `AudioContext.decodeAudioData`, mischt auf 16 kHz mono mu-law und legt 10 Sekunden in ein Paket von genau 160012 Bytes. Die Ansage „Du bist der Imposter“ plus Stille hat dieselbe Länge. Verteilt wird dieses Paket, nicht die Original-MP3.
- Verteilen: Base64-Stücke zu 18000 Bytes über `multiplayer.send`. Der Host drosselt auf sechs Nachrichten, dann 800 ms Pause, damit das Limit von 80 Nachrichten in 10 Sekunden hält. Acht Handys brauchen dafür mehrere Sekunden, nicht 1–2 Sekunden.
- Startzeit: Gäste schätzen den Offset zur Host-Uhr (NTP, kleinste Laufzeit gewinnt). Der Host nennt einen Zeitpunkt. Die Wiedergabe startet über die Uhr von `AudioContext`, nicht über einen nativen Scheduler. `setTimeout` schaltet danach nur die Abstimmung frei.
- Wach bleiben: Browser-Gäste rufen die Wake Lock API. `keepAwake` der Bridge tut im Browser-Gast nichts.

## Vorgeschlagene Methoden

```javascript
// Datei vom Gerät, ohne Pfad nach außen zu geben.
const picked = await OpenScrBridge.files.pickAudio({
  accept: ['audio/mpeg'],
  multiple: true
});
// picked: [{ name: string, mime: string, bytes: Uint8Array, durationMs: number }]

// Schnitt auf dem Gerät. Ergebnis ist für alle Empfänger gleich groß.
const clip = await OpenScrBridge.audio.cut({
  bytes: picked[0].bytes,
  startMs: 30000,
  durationMs: 10000,
  targetBytes: 180000
});
// clip: { bytes: Uint8Array, durationMs: number, byteLength: number }

// Ansage mit Stille, auf dieselbe Länge aufgefüllt.
const secret = await OpenScrBridge.audio.speak({
  text: 'Du bist der Imposter',
  voice: 'de',
  durationMs: 10000,
  padToBytes: clip.byteLength
});
// secret: { bytes: Uint8Array, byteLength: number }

// Binär an einen Sitzplatz. Kein JSON, kein 32-KiB-Deckel, kein 80er-Limit.
await OpenScrBridge.multiplayer.sendBinary({
  to: playerId,
  bytes: clip.bytes,
  id: 'c3'
});

// Gemeinsame Uhr. now() ist die Host-Uhr in Millisekunden.
const clock = await OpenScrBridge.clock.sync();
// clock: { now: () => number, offsetMs: number }

// Startet genau zu einem Zeitpunkt der gemeinsamen Uhr und stoppt nach durationMs.
await OpenScrBridge.audio.schedulePlay({
  bytes: clip.bytes,
  startAtMs: clock.now() + 700,
  durationMs: 10000
});
await OpenScrBridge.audio.stop();
```

`files.pickAudio` darf nur Bytes an die OpenScrapp geben, keinen Dauerpfad und keine Mediathek-Berechtigung über die eine Auswahl hinaus. `sendBinary` bleibt im Raum und an die OpenScrapp gebunden, wie `multiplayer.send`. `schedulePlay` soll die Ausgabezeit planen, Bluetooth-Puffer eingeschlossen, mit einer Toleranz von 100 ms.
