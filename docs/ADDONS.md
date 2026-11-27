# Add-ons für Imposter Dance

Ein Add-on ist ein eigenes Repo. Der OpenScr-Container hängt es in diesen Scrapp. Mehrere Add-ons laufen gleichzeitig, jedes mit eigenem Icon in der Leiste des Containers. Dieser Scrapp definiert nur die Schnittstelle. Der Container entsteht im OpenScr-Repo und wird hier nicht gebaut.

Bis der Container die Skripte einhängt, nimmt Imposter Dance dasselbe Format über die globale Variable und das Event `openscr:addon` an.

## Erweiterungspunkt

```javascript
window.ImposterDance.registerMusicSource({
  id: 'demo-ton',
  name: 'Testton',
  icon: '♪',
  search(query) {
    return [{ id: 'a', title: 'Ton A', seconds: 30 }];
  },
  async getClip(item, startSec, durationSec) {
    return audioBufferOrPcm;
  }
});
```

`search(query)` liefert eine Liste. Jeder Eintrag hat `id` und `title` oder `name`, optional `seconds`. Dieselbe Objektform kommt wieder in `getClip`.

`getClip(item, startSec, durationSec)` liefert den Ausschnitt, ab `startSec`, `durationSec` ist 10. Erlaubt sind:

- ein `AudioBuffer`
- ein `ArrayBuffer` oder `Uint8Array` mit PCM, 16-bit little-endian, mono, 16 kHz
- `{ pcm: Int16Array, sampleRate }`
- das fertige Paket von genau 160012 Bytes (Kopf `IDN1`)

Der Host macht daraus das bestehende 10-Sekunden-Paket, verteilt es und spielt es synchron. Die MP3-Dateiauswahl ist die erste Quelle (`id: local-mp3`) und läuft über dieselbe Funktion. Sind mehrere Quellen registriert, wählt der Host sie in der Leiste. Quellen mit Suche bekommen ein Suchfeld. Die Dateiquelle behält die MP3-Auswahl.

`window.ImposterDance.version` ist `1.0.0`. `window.ImposterDance.scrappId` ist `imposter-dance`.

## addon.json

```json
{
  "id": "demo-ton",
  "name": "Testton",
  "version": "0.1.0",
  "icon": "♪",
  "targetScrapp": "imposter-dance",
  "minScrappVersion": "1.0.0",
  "entry": "addon.js"
}
```

| Feld | Bedeutung |
| --- | --- |
| `id` | stabile Kennung, einmal pro Add-on |
| `name` | sichtbarer Name |
| `version` | Version des Add-ons |
| `icon` | Zeichen, `https`-URL oder `data:image/…` |
| `targetScrapp` | muss `imposter-dance` sein |
| `minScrappVersion` | Mindestversion dieses Scrapps, `major.minor.patch` |
| `entry` | Skript, das der Container lädt |

Icon und Name zeigt die Quellenleiste, sobald mehr als eine Quelle registriert ist.

## Fallback, solange der Container nichts injiziert

Das Entry-Skript übergibt Manifest und `register`. Beides ist gültig:

```javascript
const addon = {
  manifest: {
    id: 'demo-ton',
    name: 'Testton',
    version: '0.1.0',
    icon: '♪',
    targetScrapp: 'imposter-dance',
    minScrappVersion: '1.0.0',
    entry: 'addon.js'
  },
  register(api) {
    api.registerMusicSource({
      id: 'demo-ton',
      name: 'Testton',
      icon: '♪',
      search() {
        return [{ id: 'ton-a', title: 'Testton A', seconds: 10 }];
      },
      getClip(item, startSec, durationSec) {
        const rate = 16000;
        const count = Math.round(durationSec * rate);
        const pcm = new Int16Array(count);
        for (let i = 0; i < count; i += 1) {
          pcm[i] = Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 4000);
        }
        return { pcm: pcm, sampleRate: rate };
      }
    });
  }
};

window['openscr:addon'] = addon;
window.dispatchEvent(new CustomEvent('openscr:addon', { detail: addon }));
```

Ein Array an derselben Stelle registriert mehrere Add-ons. Dieselbe `id` und `version` wird nur einmal angenommen. Eine zu hohe `minScrappVersion` oder ein anderes `targetScrapp` wird ausgelassen. `register` bekommt `{ version, scrappId, registerMusicSource }`.

Direktes Registrieren ohne Manifest bleibt für die eingebaute Dateiquelle:

```javascript
window.ImposterDance.registerMusicSource({ id, name, icon, search, getClip });
```
