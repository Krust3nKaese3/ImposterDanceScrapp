/*
 * Gemeinsame Spielerliste für Song raten und Werwolf.
 * Keine Abhängigkeiten. Werwolf kann diese Datei 1:1 übernehmen.
 *
 * Speicherwert unter dem App-Schlüssel (Song raten: songraten.players.v1):
 * {"v":1,"players":[{"id":"p_<Date.now() in base36><4 base36>","first":"Maximilian","last":"Bausch","created":<ms>}]}
 *
 * Im klassischen Script liegt die API auf globalThis.OpenScrPlayers.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.OpenScrPlayers = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function normalize(value) {
    return String(value == null ? '' : value)
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}+/gu, '');
  }

  function createPlayer(first, last, now, random) {
    const given = String(first == null ? '' : first).trim();
    const family = String(last == null ? '' : last).trim();
    if (!given || !family) return null;
    const stamp = Math.floor(now == null ? Date.now() : now);
    const rnd = typeof random === 'function' ? random : Math.random;
    let suffix = '';
    for (let i = 0; i < 4; i += 1) suffix += Math.floor(rnd() * 36).toString(36);
    return {
      id: 'p_' + stamp.toString(36) + suffix,
      first: given,
      last: family,
      created: stamp
    };
  }

  function fullName(player) {
    return (normalize(player && player.first) + ' ' + normalize(player && player.last)).trim();
  }

  function search(players, query, excludeIds) {
    const exclude = new Set(excludeIds || []);
    const needle = normalize(query);
    const rows = [];
    (players || []).forEach((player) => {
      if (!player || exclude.has(player.id)) return;
      const first = normalize(player.first);
      const last = normalize(player.last);
      const full = (first + ' ' + last).trim();
      let rank = 2;
      if (needle) {
        const prefix = first.startsWith(needle) || last.startsWith(needle) || full.startsWith(needle);
        const partial = !prefix && (first.includes(needle) || last.includes(needle) || full.includes(needle));
        if (prefix) rank = 0;
        else if (partial) rank = 1;
        else return;
      }
      rows.push({ player: player, rank: rank, sort: full || first });
    });
    rows.sort((a, b) => a.rank - b.rank
      || a.sort.localeCompare(b.sort, 'de')
      || String(a.player.id).localeCompare(String(b.player.id)));
    return rows.map((row) => row.player);
  }

  function displayNames(players) {
    const list = Array.isArray(players) ? players : [];
    const firstKey = list.map((player) => normalize(player && player.first));
    const initialKey = list.map((player, index) => {
      const last = String(player && player.last || '').trim();
      return firstKey[index] + '\n' + (last ? normalize(last.charAt(0)) : '');
    });
    const firstCount = new Map();
    const initialCount = new Map();
    firstKey.forEach((key) => firstCount.set(key, (firstCount.get(key) || 0) + 1));
    list.forEach((player, index) => {
      if ((firstCount.get(firstKey[index]) || 0) < 2) return;
      const key = initialKey[index];
      initialCount.set(key, (initialCount.get(key) || 0) + 1);
    });
    return list.map((player, index) => {
      const first = String(player && player.first || '').trim();
      const last = String(player && player.last || '').trim();
      let name = first;
      if ((firstCount.get(firstKey[index]) || 0) > 1) {
        if ((initialCount.get(initialKey[index]) || 0) > 1) name = (first + ' ' + last).trim();
        else if (last) name = first + ' ' + last.charAt(0) + '.';
      }
      return { id: player && player.id, name: name };
    });
  }

  return {
    normalize: normalize,
    search: search,
    displayNames: displayNames,
    createPlayer: createPlayer
  };
});
