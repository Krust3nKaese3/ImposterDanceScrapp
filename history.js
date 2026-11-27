/*
 * Gemeinsame Song-Historie über OpenScrBridge.songHistory.
 * Fehlt die Bridge (älteres OpenScr, Browser-Gast), bleiben alle Aufrufe leer.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ImposterHistory = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function clean(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, 200);
  }

  function songHistoryOf(bridge) {
    if (!bridge || typeof bridge !== 'object') return null;
    const history = bridge.songHistory;
    if (!history || typeof history !== 'object') return null;
    return history;
  }

  function trackPayload(track) {
    const item = track && track.item && typeof track.item === 'object' ? track.item : {};
    const title = clean(item.title || item.name || (track && track.name));
    if (!title) return null;
    const artist = clean(item.artist || item.channel || (track && track.artist));
    const payload = { title: title };
    if (artist) payload.artist = artist;
    return payload;
  }

  function searchText(entry) {
    const title = clean(entry && entry.title);
    if (!title) return '';
    const artist = clean(entry && entry.artist);
    return artist ? title + ' ' + artist : title;
  }

  function uniqueSongs(entries) {
    const seen = {};
    const songs = [];
    (Array.isArray(entries) ? entries : []).forEach((entry) => {
      const query = searchText(entry);
      if (!query || seen[query]) return;
      seen[query] = true;
      const song = { title: clean(entry.title), query: query };
      const artist = clean(entry.artist);
      if (artist) song.artist = artist;
      songs.push(song);
    });
    return songs;
  }

  function labelFor(sourceName) {
    const name = clean(sourceName);
    return name ? 'Songs aus ' + name : 'Heute schon gespielt';
  }

  function offersFrom(sourceRows, songs) {
    const list = Array.isArray(songs) ? songs : [];
    const rows = Array.isArray(sourceRows) ? sourceRows : [];
    const used = {};
    const offers = [];
    function push(source, sourceName, entries) {
      const picked = uniqueSongs(entries);
      if (!picked.length || used[source]) return;
      used[source] = true;
      offers.push({ source: source, label: labelFor(sourceName), songs: picked });
    }
    rows.forEach((row) => {
      if (!row || row.source == null || row.source === '') return;
      const source = String(row.source);
      push(source, row.sourceName, list.filter((entry) => entry && String(entry.source) === source));
    });
    const leftover = {};
    list.forEach((entry) => {
      if (!entry || entry.source == null || entry.source === '') return;
      const source = String(entry.source);
      if (used[source]) return;
      if (!leftover[source]) leftover[source] = { name: entry.sourceName, entries: [] };
      leftover[source].entries.push(entry);
    });
    Object.keys(leftover).forEach((source) => {
      push(source, leftover[source].name, leftover[source].entries);
    });
    return offers;
  }

  async function recordTrack(bridge, track) {
    const history = songHistoryOf(bridge);
    if (!history || typeof history.add !== 'function') return { ok: false, skipped: true };
    const payload = trackPayload(track);
    if (!payload) return { ok: false, skipped: true };
    try {
      const result = await history.add(payload);
      return result && result.ok === false ? result : { ok: true };
    } catch (error) {
      return { ok: false, error: error };
    }
  }

  async function loadOffers(bridge) {
    const history = songHistoryOf(bridge);
    if (!history || typeof history.list !== 'function' || typeof history.sources !== 'function') return [];
    try {
      const songs = await history.list({ excludeSelf: true });
      const sources = await history.sources();
      return offersFrom(sources, songs);
    } catch (error) {
      return [];
    }
  }

  return {
    clean: clean,
    songHistoryOf: songHistoryOf,
    trackPayload: trackPayload,
    searchText: searchText,
    offersFrom: offersFrom,
    recordTrack: recordTrack,
    loadOffers: loadOffers
  };
});
