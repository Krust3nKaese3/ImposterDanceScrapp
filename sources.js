/*
 * Musikquellen für Imposter Dance.
 * Die MP3-Auswahl des Hosts und spätere OpenScr-Add-ons registrieren sich hier.
 * Kein DOM, keine Bridge. Das Format steht in docs/ADDONS.md.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.ImposterSources = api;
    const dance = root.ImposterDance || (root.ImposterDance = {});
    dance.version = api.VERSION;
    dance.scrappId = api.SCRAPP_ID;
    dance.registerMusicSource = api.registerMusicSource;
    dance.listMusicSources = api.list;
    api.installAddonSlot(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '1.0.0';
  const SCRAPP_ID = 'imposter-dance';
  const ADDON_KEY = 'openscr:addon';
  const sources = [];
  const seenAddons = [];
  const listeners = [];

  function emit() {
    listeners.forEach((fn) => {
      try { fn(); } catch (error) { /* eine Oberfläche darf die anderen nicht stoppen */ }
    });
  }

  function parseVersion(value) {
    const match = String(value || '').trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!match) return null;
    return [Number(match[1]), Number(match[2]), Number(match[3])];
  }

  function versionAtLeast(have, need) {
    if (!need) return true;
    const left = parseVersion(have);
    const right = parseVersion(need);
    if (!left || !right) return false;
    for (let i = 0; i < 3; i += 1) {
      if (left[i] > right[i]) return true;
      if (left[i] < right[i]) return false;
    }
    return true;
  }

  function sameTarget(value) {
    const text = String(value || '').trim().toLowerCase();
    const dashed = text.replace(/\s+/g, '-');
    if (dashed === SCRAPP_ID || dashed === 'imposterdance' || dashed === 'imposter-dance-scrapp') return true;
    return text.endsWith('/imposterdancescrapp');
  }

  function publicSource(source) {
    return { id: source.id, name: source.name, icon: source.icon, ui: source.ui };
  }

  function registerMusicSource(spec) {
    if (!spec || typeof spec !== 'object') return { ok: false, error: 'Die Quelle fehlt.' };
    const id = typeof spec.id === 'string' ? spec.id.trim() : '';
    const name = typeof spec.name === 'string' ? spec.name.trim() : '';
    if (!id) return { ok: false, error: 'Die Quelle braucht eine id.' };
    if (!name) return { ok: false, error: 'Die Quelle braucht einen Namen.' };
    if (typeof spec.search !== 'function') return { ok: false, error: 'Die Quelle braucht search().' };
    if (typeof spec.getClip !== 'function') return { ok: false, error: 'Die Quelle braucht getClip().' };
    const source = {
      id: id,
      name: name,
      icon: spec.icon == null || spec.icon === '' ? '♪' : String(spec.icon),
      ui: spec.ui === 'files' ? 'files' : 'search',
      search: spec.search,
      getClip: spec.getClip
    };
    const index = sources.findIndex((item) => item.id === id);
    if (index >= 0) sources[index] = source;
    else sources.push(source);
    emit();
    return { ok: true, source: publicSource(source) };
  }

  function list() {
    return sources.map(publicSource);
  }

  function get(id) {
    return sources.find((item) => item.id === id) || null;
  }

  function hostApi() {
    return {
      version: VERSION,
      scrappId: SCRAPP_ID,
      registerMusicSource: registerMusicSource
    };
  }

  function addonKey(manifest) {
    return manifest.id + '@' + (manifest.version || '');
  }

  function ingestAddon(payload) {
    if (!payload) return { ok: false, error: 'Leeres Add-on.' };
    if (Array.isArray(payload)) {
      const results = payload.map(ingestAddon);
      const failed = results.find((item) => !item.ok);
      return failed || { ok: true, count: results.length };
    }
    if (typeof payload.search === 'function' && typeof payload.getClip === 'function') {
      return registerMusicSource(payload);
    }
    const manifest = payload.manifest || {};
    if (!manifest.id) return { ok: false, error: 'addon.json braucht eine id.' };
    if (!sameTarget(manifest.targetScrapp)) {
      return { ok: false, error: 'Das Add-on gilt nicht für Imposter Dance.' };
    }
    if (!versionAtLeast(VERSION, manifest.minScrappVersion)) {
      return { ok: false, error: 'Imposter Dance ist älter als minScrappVersion.' };
    }
    const register = payload.register || payload.activate;
    if (typeof register !== 'function') return { ok: false, error: 'Das Add-on braucht register(api).' };
    const key = addonKey(manifest);
    if (seenAddons.indexOf(key) >= 0) return { ok: true, duplicate: true, id: manifest.id };
    seenAddons.push(key);
    register(hostApi());
    return { ok: true, id: manifest.id };
  }

  function installAddonSlot(target) {
    if (!target || target.__imposterAddonSlot) return;
    let current;
    try {
      current = target[ADDON_KEY];
    } catch (error) {
      current = undefined;
    }
    try {
      Object.defineProperty(target, ADDON_KEY, {
        configurable: true,
        enumerable: true,
        get: function () { return current; },
        set: function (value) {
          current = value;
          ingestAddon(value);
        }
      });
    } catch (error) {
      if (current) ingestAddon(current);
    }
    if (current) ingestAddon(current);
    if (typeof target.addEventListener === 'function') {
      target.addEventListener(ADDON_KEY, function (event) {
        ingestAddon(event && event.detail);
      });
    }
    target.__imposterAddonSlot = true;
  }

  function asBytes(value) {
    if (!value) return null;
    if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) return new Uint8Array(value);
    if (typeof Uint8Array !== 'undefined' && value instanceof Uint8Array) return value;
    return null;
  }

  function isPacket(bytes) {
    if (!bytes || bytes.length < 12) return false;
    const mulaw = bytes[0] === 0x4d && bytes[1] === 0x55 && bytes[2] === 0x4c && bytes[3] === 0x57;
    const legacy = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x4e && bytes[3] === 0x31;
    return mulaw || legacy;
  }

  function int16FromBytes(bytes) {
    const count = Math.floor(bytes.length / 2);
    const out = new Int16Array(count);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i < count; i += 1) out[i] = view.getInt16(i * 2, true);
    return out;
  }

  function pcmFromProduced(produced, audio) {
    if (produced && (produced.pcm || produced.samples)) {
      const samples = produced.pcm || produced.samples;
      return { samples: samples, rate: produced.sampleRate || produced.rate || audio.RATE };
    }
    if (produced && typeof produced.getChannelData === 'function' && produced.sampleRate) {
      const channels = [];
      const n = produced.numberOfChannels || 1;
      for (let c = 0; c < n; c += 1) channels.push(produced.getChannelData(c));
      const mono = channels.length > 1 && audio.mixToMono
        ? audio.mixToMono(channels)
        : audio.floatChannelToInt16(channels[0]);
      return { samples: mono, rate: produced.sampleRate };
    }
    const bytes = asBytes(produced);
    if (!bytes) return null;
    return { samples: int16FromBytes(bytes), rate: audio.RATE };
  }

  function toClipBytes(produced, audio, seconds) {
    if (!audio || typeof audio.clipFromPcm !== 'function') throw new Error('Audio fehlt.');
    const bytes = asBytes(produced);
    if (bytes && isPacket(bytes)) return bytes;
    const pcm = pcmFromProduced(produced, audio);
    if (!pcm || !pcm.samples) throw new Error('Der Ausschnitt ist kein Ton.');
    return audio.clipFromPcm(pcm.samples, pcm.rate, 0, seconds);
  }

  return {
    VERSION: VERSION,
    SCRAPP_ID: SCRAPP_ID,
    ADDON_KEY: ADDON_KEY,
    registerMusicSource: registerMusicSource,
    list: list,
    get: get,
    onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
    ingestAddon: ingestAddon,
    installAddonSlot: installAddonSlot,
    versionAtLeast: versionAtLeast,
    toClipBytes: toClipBytes,
    hostApi: hostApi
  };
});
