/*
 * Add-on-Helfer und Fallback, wenn der OpenScr-Container noch kein addon.json einsetzt.
 * Der Container selbst injiziert nach dem Scrapp-Code und feuert openscr:addon.
 * Auf iOS bleibt addonsAvailable falsch: hier wird nichts geladen.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ImposterAddons = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
  const VER_RE = /^\d{1,6}(\.\d{1,6}){0,3}$/;
  const CHUNK = 48 * 1024;

  function parseVersion(value) {
    const text = String(value || '');
    if (!VER_RE.test(text)) throw new Error('Versionsnummer ist ungültig: ' + text);
    return text.split('.').map((part) => Number(part));
  }

  function versionAtLeast(current, min) {
    const a = parseVersion(current);
    const b = parseVersion(min);
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i += 1) {
      const left = a[i] || 0;
      const right = b[i] || 0;
      if (left > right) return true;
      if (left < right) return false;
    }
    return true;
  }

  function needString(value, label, max) {
    if (typeof value !== 'string') throw new Error('addon.json: ' + label + ' fehlt.');
    const text = value.trim();
    if (!text || text.length > max) throw new Error('addon.json: ' + label + ' ist ungültig.');
    return text;
  }

  function parseAddonManifest(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('addon.json ist kein Objekt.');
    const id = needString(raw.id, 'id', 64);
    if (!ID_RE.test(id)) throw new Error('addon.json: id nur Kleinbuchstaben, Ziffern und Bindestrich.');
    const entry = needString(raw.entry, 'entry', 120);
    if (entry.startsWith('/') || entry.split('/').some((part) => part === '..' || part === '')) {
      throw new Error('addon.json: entry ist kein relativer Pfad.');
    }
    if (!/\.(m|c)?js$/i.test(entry)) throw new Error('addon.json: entry muss eine JavaScript-Datei sein.');
    const version = needString(raw.version, 'version', 24);
    const minScrappVersion = needString(raw.minScrappVersion, 'minScrappVersion', 24);
    parseVersion(version);
    parseVersion(minScrappVersion);
    return {
      id: id,
      name: needString(raw.name, 'name', 60),
      version: version,
      icon: needString(raw.icon, 'icon', 32),
      targetScrapp: needString(raw.targetScrapp, 'targetScrapp', 160),
      minScrappVersion: minScrappVersion,
      entry: entry
    };
  }

  function repoSlug(repoUrl) {
    const match = String(repoUrl || '').match(/github\.com\/([^/]+)\/([^/#?]+)/i);
    if (!match) return null;
    return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
  }

  function scrappMatchesTarget(target, app) {
    const want = String(target || '').trim().toLowerCase();
    if (!want || !app) return false;
    if (want === String(app.id || '').toLowerCase()) return true;
    if (want === String(app.name || '').trim().toLowerCase()) return true;
    const slug = repoSlug(app.repoUrl);
    if (!slug) return false;
    const full = (slug.owner + '/' + slug.repo).toLowerCase();
    return want === full || want === slug.repo.toLowerCase() || want === slug.owner.toLowerCase();
  }

  function planInjection(addons, scrapp) {
    const loaded = [];
    const errors = [];
    const sources = [];
    (addons || []).forEach((addon) => {
      if (!addon || addon.enabled === false) return;
      let manifest;
      try {
        manifest = parseAddonManifest(addon);
      } catch (error) {
        errors.push({ id: String(addon.id || ''), name: String(addon.name || ''), message: error.message || String(error) });
        return;
      }
      if (!scrappMatchesTarget(manifest.targetScrapp, scrapp)) return;
      try {
        if (!versionAtLeast(scrapp.version, manifest.minScrappVersion)) {
          throw new Error('OpenScrapp ' + scrapp.version + ' ist älter als minScrappVersion ' + manifest.minScrappVersion + '.');
        }
        const entry = manifest.entry.replace(/^\.\//, '');
        const files = addon.files || {};
        if (!Object.prototype.hasOwnProperty.call(files, entry)) throw new Error('Einstieg ' + manifest.entry + ' fehlt im Zwischenspeicher.');
        Object.keys(files).filter((name) => name !== entry).sort().forEach((name) => {
          sources.push({ id: manifest.id, file: name, code: String(files[name]) });
        });
        sources.push({ id: manifest.id, file: entry, code: String(files[entry]) });
        loaded.push({ id: manifest.id, name: manifest.name, version: manifest.version, icon: manifest.icon });
      } catch (error) {
        errors.push({ id: manifest.id, name: manifest.name, message: error.message || String(error) });
      }
    });
    return { loaded: loaded, errors: errors, sources: sources };
  }

  function bytesToB64(bytes) {
    let binary = '';
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) {
      const slice = bytes.subarray(i, Math.min(bytes.length, i + step));
      binary += String.fromCharCode.apply(null, slice);
    }
    return btoa(binary);
  }

  async function browserFetch(url, options) {
    const opts = options || {};
    const response = await fetch(url, {
      method: opts.method || 'GET',
      headers: opts.headers,
      body: opts.body
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    const headers = {};
    response.headers.forEach((value, key) => { headers[key] = value; });
    const base = { ok: response.ok, status: response.status, headers: headers, byteLength: bytes.length };
    if (opts.chunked) {
      const chunks = [];
      for (let i = 0; i < bytes.length; i += CHUNK) chunks.push(bytesToB64(bytes.subarray(i, i + CHUNK)));
      return Object.assign(base, { encoding: 'base64-chunks', chunks: chunks });
    }
    if (opts.binary) return Object.assign(base, { encoding: 'base64', body: bytesToB64(bytes) });
    return Object.assign(base, { encoding: 'text', body: new TextDecoder().decode(bytes) });
  }

  function netFetch(url, options, bridge) {
    const api = bridge || null;
    if (api && api.net && typeof api.net.fetch === 'function') return api.net.fetch(url, options || {});
    return browserFetch(url, options);
  }

  function runSources(sources, evalSource) {
    const errors = [];
    (sources || []).forEach((source) => {
      try {
        evalSource(source.code);
      } catch (error) {
        errors.push({ id: source.id, file: source.file, message: String((error && error.message) || error) });
      }
    });
    return errors;
  }

  function install(env) {
    const bridge = env && env.bridge;
    const target = env && env.target ? env.target : {};
    target.ImposterAddon = {
      net: {
        fetch: function (url, options) { return netFetch(url, options, bridge); }
      }
    };
    if (bridge && bridge.addonsAvailable === false) {
      return { loaded: [], errors: [], skipped: true };
    }
    if (env && env.hostInjects) return { loaded: [], errors: [], skipped: false };
    const plan = planInjection(env && env.cache, env && env.scrapp);
    const runtimeErrors = runSources(plan.sources, (env && env.evalSource) || function (code) {
      const run = new Function(code);
      run();
    });
    runtimeErrors.forEach((error) => {
      if (target.__openscrAddonErrors) target.__openscrAddonErrors.push(error);
      else target.__openscrAddonErrors = [error];
    });
    if (env && env.dispatch) env.dispatch({ loaded: plan.loaded, errors: plan.errors });
    return plan;
  }

  return {
    parseAddonManifest: parseAddonManifest,
    versionAtLeast: versionAtLeast,
    scrappMatchesTarget: scrappMatchesTarget,
    planInjection: planInjection,
    netFetch: netFetch,
    install: install
  };
});
