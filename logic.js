/*
 * Runden, Uhrabgleich und Abstimmung. Kein DOM, keine Bridge.
 * Zurück auf dem Abstimmbild nimmt die Runde nicht weg.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ImposterLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MIN_PLAYERS = 3;
  const MAX_NAME = 24;

  function clipName(value) {
    return String(value == null ? '' : value).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, MAX_NAME);
  }

  function createMatch(players) {
    const list = (players || []).map((player, index) => ({
      id: String(player.id == null ? index + 1 : player.id),
      name: clipName(player.name || player.first || 'Spieler'),
      score: Number(player.score) || 0
    }));
    return {
      players: list,
      round: 0,
      phase: 'lobby',
      imposterId: null,
      clipId: '',
      ready: {},
      vote: null,
      last: null
    };
  }

  function enough(match) {
    return Boolean(match && match.players && match.players.length >= MIN_PLAYERS);
  }

  function pickImposter(ids, rng) {
    const roll = typeof rng === 'function' ? rng : Math.random;
    const list = ids || [];
    if (!list.length) return null;
    return list[Math.floor(roll() * list.length)];
  }

  function beginRound(match, rng) {
    if (!enough(match)) return { ok: false, reason: 'players' };
    const ids = match.players.map((player) => player.id);
    match.round += 1;
    match.phase = 'deal';
    match.imposterId = pickImposter(ids, rng);
    match.clipId = 'c' + match.round;
    match.ready = {};
    match.vote = null;
    match.last = null;
    return { ok: true, imposterId: match.imposterId, clipId: match.clipId };
  }

  function markReady(match, playerId) {
    if (!match || match.phase !== 'deal' && match.phase !== 'ready') return false;
    match.phase = 'ready';
    match.ready[String(playerId)] = true;
    return allReady(match);
  }

  function allReady(match) {
    return Boolean(match && match.players.length && match.players.every((player) => match.ready[player.id]));
  }

  function arm(match, startAt) {
    if (!allReady(match)) return { ok: false, reason: 'loading' };
    match.phase = 'dance';
    match.startAt = startAt;
    return { ok: true };
  }

  function openVote(match) {
    if (!match || match.phase !== 'dance') return false;
    match.phase = 'vote';
    match.vote = { ballots: {}, claimed: {} };
    return true;
  }

  function claim(match, playerId) {
    const vote = match && match.vote;
    const id = String(playerId);
    if (!vote || match.phase !== 'vote') return { ok: false, reason: 'phase' };
    if (!match.players.some((player) => player.id === id)) return { ok: false, reason: 'unknown' };
    if (vote.ballots[id]) return { ok: false, reason: 'voted' };
    vote.claimed[id] = true;
    return { ok: true };
  }

  function back(match, playerId) {
    const vote = match && match.vote;
    const id = String(playerId);
    if (!vote) return { ok: false, reason: 'phase', consumed: false };
    if (vote.ballots[id]) return { ok: false, reason: 'voted', consumed: false };
    delete vote.claimed[id];
    return { ok: true, consumed: false };
  }

  function cast(match, playerId, suspectId) {
    const vote = match && match.vote;
    const id = String(playerId);
    const suspect = String(suspectId);
    if (!vote || match.phase !== 'vote') return { ok: false, reason: 'phase' };
    if (!vote.claimed[id]) return { ok: false, reason: 'claim' };
    if (vote.ballots[id]) return { ok: false, reason: 'voted' };
    if (id === suspect) return { ok: false, reason: 'self' };
    if (!match.players.some((player) => player.id === suspect)) return { ok: false, reason: 'unknown' };
    vote.ballots[id] = suspect;
    delete vote.claimed[id];
    return { ok: true };
  }

  function pendingVoters(match) {
    const vote = match && match.vote;
    if (!vote) return [];
    return match.players.filter((player) => !vote.ballots[player.id]).map((player) => player.id);
  }

  function tally(ballots) {
    const counts = {};
    Object.keys(ballots || {}).forEach((voter) => {
      const suspect = ballots[voter];
      counts[suspect] = (counts[suspect] || 0) + 1;
    });
    let top = null;
    let topN = 0;
    let tie = false;
    Object.keys(counts).forEach((id) => {
      const n = counts[id];
      if (n > topN) {
        top = id;
        topN = n;
        tie = false;
      } else if (n === topN) tie = true;
    });
    return { counts: counts, top: tie ? null : top, tie: tie, topN: topN };
  }

  function resolve(match) {
    if (!match || match.phase !== 'vote') return { ok: false, reason: 'phase' };
    if (pendingVoters(match).length) return { ok: false, reason: 'open' };
    const result = tally(match.vote.ballots);
    const caught = !result.tie && result.top === match.imposterId;
    match.players.forEach((player) => {
      if (caught && player.id !== match.imposterId) player.score += 1;
      if (!caught && player.id === match.imposterId) player.score += 1;
    });
    match.phase = 'reveal';
    match.last = {
      caught: caught,
      imposterId: match.imposterId,
      counts: result.counts,
      tie: result.tie,
      top: result.top
    };
    return { ok: true, last: match.last };
  }

  function publicView(match, selfId) {
    const reveal = match.phase === 'reveal';
    return {
      t: 'state',
      phase: match.phase,
      round: match.round,
      clipId: match.clipId,
      startAt: match.startAt || 0,
      selfId: selfId || '',
      players: match.players.map((player) => ({ id: player.id, name: player.name, score: player.score })),
      ready: Object.assign({}, match.ready),
      ballots: match.vote ? Object.keys(match.vote.ballots) : [],
      claimed: match.vote ? Object.keys(match.vote.claimed) : [],
      imposterId: reveal ? match.imposterId : '',
      last: reveal ? match.last : null
    };
  }

  function ntpOffset(t1, t2, t3, t4) {
    return ((Number(t2) - Number(t1)) + (Number(t3) - Number(t4))) / 2;
  }

  function ntpDelay(t1, t2, t3, t4) {
    return (Number(t4) - Number(t1)) - (Number(t3) - Number(t2));
  }

  function createClock() {
    return { samples: [] };
  }

  function pushSample(clock, offset, delay) {
    if (!clock || !isFinite(offset) || !isFinite(delay) || delay < 0) return;
    clock.samples.push({ offset: offset, delay: delay });
    if (clock.samples.length > 8) clock.samples.shift();
  }

  function clockOffset(clock) {
    if (!clock || !clock.samples.length) return 0;
    let best = clock.samples[0];
    clock.samples.forEach((sample) => {
      if (sample.delay < best.delay) best = sample;
    });
    return best.offset;
  }

  function scheduleDelay(startAt, offset, now) {
    return Number(startAt) - Number(offset) - Number(now);
  }

  const BINARY_BUDGET = 1024 * 1024;
  const BINARY_WINDOW_MS = 10000;

  function localStartAt(hostAt, offsetMs) {
    return Number(hostAt) - Number(offsetMs || 0);
  }

  function binaryWaitMs(sent, bytes, now) {
    const stamp = Number(now) || 0;
    const need = Number(bytes) || 0;
    const recent = (sent || []).filter((item) => {
      if (!item) return false;
      const age = stamp - Number(item.at);
      return age >= 0 && age < BINARY_WINDOW_MS;
    });
    recent.sort((a, b) => Number(a.at) - Number(b.at));
    let used = 0;
    recent.forEach((item) => { used += Number(item.n) || 0; });
    if (used + need <= BINARY_BUDGET) return 0;
    let drop = 0;
    while (drop < recent.length && used + need > BINARY_BUDGET) {
      used -= Number(recent[drop].n) || 0;
      drop += 1;
    }
    if (!drop) return 0;
    return Math.max(0, Number(recent[drop - 1].at) + BINARY_WINDOW_MS - stamp);
  }

  function roleFor(match, playerId) {
    if (!match || !match.imposterId) return '';
    return String(playerId) === String(match.imposterId) ? 'imposter' : 'dancer';
  }

  return {
    MIN_PLAYERS: MIN_PLAYERS,
    clipName: clipName,
    createMatch: createMatch,
    enough: enough,
    pickImposter: pickImposter,
    beginRound: beginRound,
    markReady: markReady,
    allReady: allReady,
    arm: arm,
    openVote: openVote,
    claim: claim,
    back: back,
    cast: cast,
    pendingVoters: pendingVoters,
    tally: tally,
    resolve: resolve,
    publicView: publicView,
    ntpOffset: ntpOffset,
    ntpDelay: ntpDelay,
    createClock: createClock,
    pushSample: pushSample,
    clockOffset: clockOffset,
    scheduleDelay: scheduleDelay,
    localStartAt: localStartAt,
    BINARY_BUDGET: BINARY_BUDGET,
    BINARY_WINDOW_MS: BINARY_WINDOW_MS,
    binaryWaitMs: binaryWaitMs,
    roleFor: roleFor
  };
});
