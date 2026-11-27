# Add-ons für Imposter Dance

Ein Add-on ist ein GitHub-Repository mit `addon.json` und JavaScript. OpenScr lädt es in den Entwicklereinstellungen, speichert es und setzt es **nach** dem Code dieser OpenScrapp ein. Danach feuert die Seite `openscr:addon` mit `{ loaded, errors }`. Mehrere Add-ons laufen gleichzeitig. Der Container zeigt je ein Icon.

Das gilt auf Android und in der Web-Entwicklungsumgebung. Auf iOS ist `addonsAvailable` falsch: keine Oberfläche, kein Download, kein eingesetztes Skript. `addons.js` lädt dort ebenfalls nichts.

Ältere OpenScr-Versionen setzen nichts ein. Liegt vorher `window.__openscrAddonCache` (dieselben Manifestfelder plus `enabled` und `files`), übernimmt `addons.js` das Format und feuert dasselbe Ereignis. Erkennt die Seite `OpenScrBridge.addonsAvailable === true`, bleibt die Injektion beim Container.

Die Musikquelle registriert das Entry-Skript selbst. Bis der Container die Skripte einhängt, nimmt Imposter Dance zusätzlich dasselbe Manifest über `window['openscr:addon']` und das Event an.

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
| `id` | stabile Kennung, Kleinbuchstaben, Ziffern, Bindestrich |
| `name` | sichtbarer Name |
| `version` | Version des Add-ons |
| `icon` | Zeichen, `https`-URL oder `data:image/…` |
| `targetScrapp` | `imposter-dance`, `Imposter Dance`, `ImposterDanceScrapp` oder `Krust3nKaese3/ImposterDanceScrapp` |
| `minScrappVersion` | Mindestversion dieses Scrapps, verglichen mit `1.0.0` |
| `entry` | relative `.js`-Datei, die der Container nach dem Scrapp-Code lädt |

Weitere JavaScript-Dateien im Repository kommen vor `entry`, sortiert. Eine zu hohe `minScrappVersion` lässt das Spiel weiterlaufen und landet in `errors`.

## Ereignis des Containers

```javascript
window.addEventListener('openscr:addon', (event) => {
  // event.detail.loaded: [{ id, name, version, icon }]
  // event.detail.errors: [{ id, name, message }]
});
```

Ein Fehler in einer Add-on-Datei landet in `window.__openscrAddonErrors` und bricht das Spiel nicht ab.

## Musikquelle

`window.ImposterDance.version` ist `1.0.0`. `window.ImposterDance.scrappId` ist `imposter-dance`.

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
- das fertige Paket von genau 160012 Bytes (Kopf `MULW`, ältere Pakete mit Kopf `IDN1` bleiben lesbar)

Der Host macht daraus das 10-Sekunden-Paket, verteilt es und spielt es synchron. Die MP3-Dateiauswahl ist die erste Quelle (`id: local-mp3`) und läuft über dieselbe Funktion. Sind mehrere Quellen registriert, wählt der Host sie in der Leiste. Quellen mit Suche bekommen ein Suchfeld. Die Dateiquelle behält die MP3-Auswahl. Liegt `audio.cut` auf der Bridge, schneidet der Host die gewählte Datei dort.

## Fallback ohne Container

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

Ein Array an derselben Stelle registriert mehrere Add-ons. Dieselbe `id` und `version` wird nur einmal angenommen. `register` bekommt `{ version, scrappId, registerMusicSource }`.

Direktes Registrieren ohne Manifest bleibt für die eingebaute Dateiquelle:

```javascript
window.ImposterDance.registerMusicSource({ id, name, icon, search, getClip });
```

## Netz für Add-ons

`net.fetch` der Bridge (Kategorie `http`, auch auf iOS) liegt unter `ImposterAddon.net.fetch(url, options)`. `binary` und `chunked` werden durchgereicht. Im Browser-Gast ohne native Anfrage übernimmt `fetch` und liefert Base64 oder Stücke zu 48 KiB.
