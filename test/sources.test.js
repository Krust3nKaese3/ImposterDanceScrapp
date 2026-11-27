const assert = require('assert');
const S = require('../sources.js');
const A = require('../audio.js');

function toneSource(id) {
  return {
    id: id,
    name: 'Testton',
    icon: '♪',
    search: function (query) {
      const title = query ? 'Treffer ' + query : 'Ton A';
      return [{ id: 'tone-a', title: title, seconds: 10 }];
    },
    getClip: function (item, startSec, durationSec) {
      const rate = A.RATE;
      const count = Math.round(durationSec * rate);
      const pcm = new Int16Array(count);
      for (let i = 0; i < count; i += 1) pcm[i] = Math.round(Math.sin((i + startSec * rate) / 20) * 4000);
      return { pcm: pcm, sampleRate: rate, item: item.id };
    }
  };
}

const missing = S.registerMusicSource({ id: 'x' });
assert.strictEqual(missing.ok, false);

const registered = S.registerMusicSource(toneSource('ton'));
assert.strictEqual(registered.ok, true);
assert.strictEqual(registered.source.icon, '♪');
assert.deepStrictEqual(S.list().filter((item) => item.id === 'ton').map((item) => item.name), ['Testton']);

const again = S.registerMusicSource(Object.assign(toneSource('ton'), { name: 'Testton neu' }));
assert.strictEqual(again.ok, true);
assert.strictEqual(S.list().filter((item) => item.id === 'ton').length, 1);
assert.strictEqual(S.get('ton').name, 'Testton neu');

async function main() {
const found = await S.get('ton').search('hallo');
assert.strictEqual(found[0].title, 'Treffer hallo');
const produced = await S.get('ton').getClip(found[0], 1, 10);
const packet = S.toClipBytes(produced, A);
assert.strictEqual(packet.length, A.CLIP_BYTES);
assert.ok(A.rms(A.parseClip(packet).samples) > 50);
assert.strictEqual(S.toClipBytes(packet, A), packet);

const floats = new Float32Array(A.RATE);
for (let i = 0; i < floats.length; i += 1) floats[i] = Math.sin(i / 30) * 0.2;
const buffer = {
  numberOfChannels: 1,
  sampleRate: A.RATE,
  duration: 1,
  getChannelData: function () { return floats; }
};
assert.strictEqual(S.toClipBytes(buffer, A).length, A.CLIP_BYTES);

const raw = new ArrayBuffer(2000);
const view = new DataView(raw);
for (let i = 0; i < 1000; i += 1) view.setInt16(i * 2, 1000, true);
assert.strictEqual(S.toClipBytes(raw, A).length, A.CLIP_BYTES);

assert.strictEqual(S.versionAtLeast('1.0.0', '1.0.0'), true);
assert.strictEqual(S.versionAtLeast('1.2.0', '1.0.0'), true);
assert.strictEqual(S.versionAtLeast('1.0.0', '1.1.0'), false);

const wrong = S.ingestAddon({
  manifest: { id: 'fremd', targetScrapp: 'other', minScrappVersion: '1.0.0' },
  register: function () { throw new Error('darf nicht laufen'); }
});
assert.strictEqual(wrong.ok, false);

const old = S.ingestAddon({
  manifest: {
    id: 'zu-neu',
    version: '1.0.0',
    targetScrapp: 'imposter-dance',
    minScrappVersion: '9.0.0'
  },
  register: function (api) { api.registerMusicSource(toneSource('zu-neu')); }
});
assert.strictEqual(old.ok, false);
assert.strictEqual(S.get('zu-neu'), null);

let seenApi = null;
const added = S.ingestAddon({
  manifest: {
    id: 'demo-ton',
    name: 'Testton',
    version: '0.1.0',
    icon: '♪',
    targetScrapp: 'Imposter Dance',
    minScrappVersion: '1.0.0',
    entry: 'addon.js'
  },
  register: function (api) {
    seenApi = api;
    api.registerMusicSource(toneSource('demo-ton'));
  }
});
assert.strictEqual(added.ok, true);
assert.strictEqual(seenApi.scrappId, 'imposter-dance');
assert.strictEqual(seenApi.version, '1.0.0');
assert.ok(S.get('demo-ton'));
const duplicate = S.ingestAddon({
  manifest: { id: 'demo-ton', version: '0.1.0', targetScrapp: 'imposter-dance' },
  register: function () { throw new Error('doppelt'); }
});
assert.strictEqual(duplicate.duplicate, true);

const slot = {};
S.installAddonSlot(slot);
slot['openscr:addon'] = {
  manifest: { id: 'slot-ton', version: '0.1.0', targetScrapp: 'imposter-dance', minScrappVersion: '1.0.0', entry: 'addon.js' },
  register: function (api) { api.registerMusicSource(toneSource('slot-ton')); }
};
assert.ok(S.get('slot-ton'));

assert.strictEqual(globalThis.ImposterDance.registerMusicSource, S.registerMusicSource);
console.log('ok sources');
}

main();
