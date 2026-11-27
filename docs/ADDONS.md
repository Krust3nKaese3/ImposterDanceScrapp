# Add-ons für Imposter Dance

Ein Add-on ist ein GitHub-Repository mit `addon.json` und JavaScript. OpenScr lädt es in den Entwicklereinstellungen, speichert es und setzt es **nach** dem Code dieser OpenScrapp ein. Danach feuert die Seite `openscr:addon`.

Das gilt auf Android und in der Web-Entwicklungsumgebung. Auf iOS ist `addonsAvailable` falsch: keine Oberfläche, kein Download, kein eingesetztes Skript. Der Fallback in `addons.js` lädt dort ebenfalls nichts.

Ältere OpenScr-Versionen ohne dieses System setzen nichts ein. Liegt vorher `window.__openscrAddonCache` (dieselben Felder plus `enabled` und `files`), übernimmt `addons.js` dasselbe Format und feuert dasselbe Ereignis. Erkennt die Seite `OpenScrBridge.addonsAvailable === true`, bleibt die Injektion beim Container.

## addon.json

```json
{
  "id": "dance-tools",
  "name": "Dance Tools",
  "version": "1.0.0",
  "icon": "♪",
  "targetScrapp": "Krust3nKaese3/ImposterDanceScrapp",
  "minScrappVersion": "1.0.0",
  "entry": "main.js"
}
```

`targetScrapp` trifft diese OpenScrapp über die Id `imposter-dance`, `Krust3nKaese3/ImposterDanceScrapp`, den Repository-Namen oder den Namen `Imposter Dance`. Groß- und Kleinschreibung spielt keine Rolle. `minScrappVersion` wird mit `1.0.0` aus `openscr.json` verglichen. Ist die OpenScrapp älter, läuft ihr Code weiter und das Add-on liefert eine Fehlermeldung.

`entry` ist ein relativer Pfad auf eine `.js`-Datei. Weitere JavaScript-Dateien kommen davor, sortiert.

## Ereignis

```javascript
window.addEventListener('openscr:addon', (event) => {
  // event.detail.loaded: [{ id, name, version, icon }]
  // event.detail.errors: [{ id, name, message }]
});
```

Ein Fehler in einer Add-on-Datei landet in `window.__openscrAddonErrors` und bricht das Spiel nicht ab.

## Netz für Add-ons

`net.fetch` der Bridge (Kategorie `http`, auch auf iOS) liegt für Add-ons unter `ImposterAddon.net.fetch(url, options)`. `binary` und `chunked` werden durchgereicht. Im Browser-Gast ohne native Anfrage übernimmt `fetch` und liefert Base64 oder Stücke zu 48 KiB.
