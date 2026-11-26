const assert = require('assert');
const L = require('../logic.js');
const A = require('../audio.js');
const AN = require('../announce.js');

const players = [
  { id: 'a', name: 'Ada' },
  { id: 'b', name: 'Bea' },
  { id: 'c', name: 'Cem' }
];

function fresh() {
  return L.createMatch(players);
}

let n = 0;
function rng() {
  n += 1;
  return (n % 3) / 3;
}

const tooSmall = L.createMatch(players.slice(0, 2));
assert.strictEqual(L.beginRound(tooSmall, rng).ok, false);

const match = fresh();
const begun = L.beginRound(match, () => 0);
assert.strictEqual(begun.ok, true);
assert.strictEqual(begun.imposterId, 'a');
assert.strictEqual(L.roleFor(match, 'a'), 'imposter');
assert.strictEqual(L.roleFor(match, 'b'), 'dancer');
assert.strictEqual(L.publicView(match).imposterId, '');

assert.strictEqual(L.markReady(match, 'a'), false);
assert.strictEqual(L.markReady(match, 'b'), false);
assert.strictEqual(L.markReady(match, 'c'), true);
assert.strictEqual(L.arm(match, 5000).ok, true);
assert.strictEqual(L.openVote(match), true);

assert.strictEqual(L.cast(match, 'a', 'b').ok, false);
assert.strictEqual(L.claim(match, 'a').ok, true);
const undone = L.back(match, 'a');
assert.strictEqual(undone.ok, true);
assert.strictEqual(undone.consumed, false);
assert.deepStrictEqual(L.pendingVoters(match), ['a', 'b', 'c']);

assert.strictEqual(L.claim(match, 'a').ok, true);
assert.strictEqual(L.cast(match, 'a', 'a').ok, false);
assert.strictEqual(L.cast(match, 'a', 'b').ok, true);
assert.strictEqual(L.back(match, 'a').ok, false);
assert.strictEqual(L.claim(match, 'b').ok, true);
assert.strictEqual(L.cast(match, 'b', 'a').ok, true);
assert.strictEqual(L.claim(match, 'c').ok, true);
assert.strictEqual(L.cast(match, 'c', 'a').ok, true);
const resolved = L.resolve(match);
assert.strictEqual(resolved.ok, true);
assert.strictEqual(resolved.last.caught, true);
assert.strictEqual(match.players.find((player) => player.id === 'a').score, 0);
assert.strictEqual(match.players.find((player) => player.id === 'b').score, 1);
assert.strictEqual(L.publicView(match).imposterId, 'a');

const escape = fresh();
L.beginRound(escape, () => 0.9);
assert.strictEqual(escape.imposterId, 'c');
L.markReady(escape, 'a');
L.markReady(escape, 'b');
L.markReady(escape, 'c');
L.arm(escape, 1);
L.openVote(escape);
['a', 'b', 'c'].forEach((id) => {
  assert.strictEqual(L.claim(escape, id).ok, true);
});
L.cast(escape, 'a', 'b');
L.cast(escape, 'b', 'c');
L.cast(escape, 'c', 'a');
const escaped = L.resolve(escape);
assert.strictEqual(escaped.last.tie, true);
assert.strictEqual(escaped.last.caught, false);
assert.strictEqual(escape.players.find((player) => player.id === 'c').score, 1);

const offset = L.ntpOffset(1000, 1100, 1110, 1200);
assert.strictEqual(offset, 5);
assert.strictEqual(L.ntpDelay(1000, 1100, 1110, 1200), 190);
const clock = L.createClock();
L.pushSample(clock, 40, 30);
L.pushSample(clock, 5, 8);
L.pushSample(clock, 9, 12);
assert.strictEqual(L.clockOffset(clock), 5);
assert.strictEqual(L.scheduleDelay(10_000, 5, 9_000), 995);

const tone = new Int16Array(A.RATE);
for (let i = 0; i < tone.length; i += 1) tone[i] = Math.round(Math.sin(i / 8) * 8000);
const song = A.clipFromPcm(tone, A.RATE, 0);
const imposter = A.imposterFromAnnouncement(A.b64ToBytes(AN.b64));
assert.strictEqual(song.length, A.CLIP_BYTES);
assert.strictEqual(imposter.length, song.length);
const parsedSong = A.parseClip(song);
const parsedImposter = A.parseClip(imposter);
assert.ok(A.rms(parsedSong.samples) > 100);
assert.ok(A.rms(parsedImposter.samples.subarray(0, 8000)) > 50);
assert.strictEqual(A.rms(parsedImposter.samples.subarray(parsedImposter.samples.length - 1000)), 0);

const parts = A.splitClip(song, 'c1');
const asm = A.createAssembler();
let rebuilt = null;
parts.forEach((part) => { rebuilt = A.pushChunk(asm, part) || rebuilt; });
assert.deepStrictEqual(rebuilt, song);
parts.forEach((part) => {
  const json = JSON.stringify(part);
  assert.ok(Buffer.byteLength(json) < 32 * 1024, json.length);
});

const frame = new Uint8Array(417);
frame[0] = 0xff;
frame[1] = 0xfb;
frame[2] = 0x90;
frame[3] = 0x00;
const cut = A.cutMp3(frame, 10);
assert.ok(cut && cut.bytes.length >= 4);

console.log('ok logic+audio');
