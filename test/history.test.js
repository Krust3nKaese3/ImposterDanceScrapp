const assert = require('assert');
const H = require('../history.js');

assert.strictEqual(H.songHistoryOf(null), null);
assert.strictEqual(H.songHistoryOf({}), null);
assert.strictEqual(H.songHistoryOf({ songHistory: null }), null);
assert.ok(H.songHistoryOf({ songHistory: { add: function () {} } }));

assert.strictEqual(H.trackPayload(null), null);
assert.strictEqual(H.trackPayload({ name: '   ' }), null);
assert.deepStrictEqual(H.trackPayload({
  name: 'datei.mp3',
  item: { title: 'Nacht', channel: 'Künstler' }
}), { title: 'Nacht', artist: 'Künstler' });
assert.deepStrictEqual(H.trackPayload({ name: 'Nur Datei.mp3' }), { title: 'Nur Datei.mp3' });

const offers = H.offersFrom(
  [
    { source: 'self', sourceName: 'Imposter Dance', count: 2 },
    { source: 'songraten', sourceName: 'Song raten', count: 1 },
    { source: 'leer', sourceName: 'Leer', count: 0 }
  ],
  [
    { title: 'Alt', artist: 'A', source: 'songraten', sourceName: 'Song raten', playedAt: 2 },
    { title: 'Alt', artist: 'A', source: 'songraten', sourceName: 'Song raten', playedAt: 1 }
  ]
);
assert.strictEqual(offers.length, 1);
assert.strictEqual(offers[0].label, 'Songs aus Song raten');
assert.deepStrictEqual(offers[0].songs, [{ title: 'Alt', artist: 'A', query: 'Alt A' }]);

const nameless = H.offersFrom([], [
  { title: 'Heute', source: 'x', playedAt: 1 }
]);
assert.strictEqual(nameless[0].label, 'Heute schon gespielt');
assert.strictEqual(nameless[0].songs[0].query, 'Heute');

async function main() {
  const calls = [];
  const bridge = {
    songHistory: {
      add: async function (payload) { calls.push(payload); return { ok: true }; },
      list: async function (query) {
        assert.deepStrictEqual(query, { excludeSelf: true });
        return [{ title: 'Fremd', source: 'songraten', sourceName: 'Song raten', playedAt: 1 }];
      },
      sources: async function () {
        return [{ source: 'songraten', sourceName: 'Song raten', count: 1 }];
      }
    }
  };
  const recorded = await H.recordTrack(bridge, { name: 'Datei', item: { title: 'Live', artist: 'Band' } });
  assert.deepStrictEqual(recorded, { ok: true });
  assert.deepStrictEqual(calls, [{ title: 'Live', artist: 'Band' }]);
  assert.deepStrictEqual(await H.recordTrack({}, { name: 'x' }), { ok: false, skipped: true });

  bridge.songHistory.add = async function () { throw new Error('voll'); };
  const failed = await H.recordTrack(bridge, { name: 'Live' });
  assert.strictEqual(failed.ok, false);

  const loaded = await H.loadOffers(bridge);
  assert.strictEqual(loaded[0].label, 'Songs aus Song raten');
  assert.strictEqual(loaded[0].songs[0].query, 'Fremd');
  assert.deepStrictEqual(await H.loadOffers({ songHistory: { list: async function () { throw new Error('weg'); }, sources: async function () { return []; } } }), []);
  assert.deepStrictEqual(await H.loadOffers(null), []);
}

main();
