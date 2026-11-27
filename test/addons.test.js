const assert = require('assert');
const Addons = require('../addons.js');

const manifest = Addons.parseAddonManifest({
  id: 'dance-tools',
  name: 'Dance',
  version: '1.2.0',
  icon: '♪',
  targetScrapp: 'Krust3nKaese3/ImposterDanceScrapp',
  minScrappVersion: '1.0.0',
  entry: 'main.js'
});
assert.strictEqual(manifest.id, 'dance-tools');
assert.strictEqual(Addons.versionAtLeast('1.2.0', '1.0.0'), true);
assert.strictEqual(Addons.versionAtLeast('1.0', '1.0.1'), false);
assert.throws(() => Addons.parseAddonManifest(Object.assign({}, manifest, { entry: '../x.js' })), /entry/);

const scrapp = {
  id: 'imposter-dance',
  repoUrl: 'https://github.com/Krust3nKaese3/ImposterDanceScrapp',
  name: 'Imposter Dance',
  version: '1.0.0'
};
assert.strictEqual(Addons.scrappMatchesTarget('Krust3nKaese3/ImposterDanceScrapp', scrapp), true);
assert.strictEqual(Addons.scrappMatchesTarget('ImposterDanceScrapp', scrapp), true);
assert.strictEqual(Addons.scrappMatchesTarget('other/nope', scrapp), false);

const tooNew = Addons.planInjection([{
  id: 'dance-tools',
  name: 'Dance',
  version: '1.0.0',
  icon: '♪',
  targetScrapp: 'Krust3nKaese3/ImposterDanceScrapp',
  minScrappVersion: '2.0.0',
  entry: 'main.js',
  enabled: true,
  files: { 'main.js': 'globalThis.marker = 1;' }
}], scrapp);
assert.strictEqual(tooNew.sources.length, 0);
assert.ok(tooNew.errors[0].message.includes('minScrappVersion'));

const planned = Addons.planInjection([{
  id: 'dance-tools',
  name: 'Dance',
  version: '1.0.0',
  icon: '♪',
  targetScrapp: scrapp.name,
  minScrappVersion: '1.0.0',
  entry: 'main.js',
  enabled: true,
  files: { 'lib.js': 'var lib = 1;', 'main.js': 'var started = lib;' }
}], scrapp);
assert.strictEqual(planned.sources[0].file, 'lib.js');
assert.strictEqual(planned.sources[1].file, 'main.js');
assert.strictEqual(planned.loaded[0].icon, '♪');

const target = {};
const ran = [];
const skipped = Addons.install({
  bridge: { addonsAvailable: false, net: { fetch: () => Promise.resolve({ ok: true }) } },
  target: target,
  cache: [{ id: 'dance-tools', name: 'Dance', version: '1.0.0', icon: '♪', targetScrapp: scrapp.name, minScrappVersion: '1.0.0', entry: 'main.js', enabled: true, files: { 'main.js': '1' } }],
  scrapp: scrapp,
  evalSource: (code) => { ran.push(code); },
  dispatch: () => { ran.push('event'); }
});
assert.strictEqual(skipped.skipped, true);
assert.strictEqual(ran.length, 0);
assert.strictEqual(typeof target.ImposterAddon.net.fetch, 'function');

let detail = null;
const box = {};
Addons.install({
  bridge: null,
  target: box,
  cache: [{
    id: 'dance-tools',
    name: 'Dance',
    version: '1.0.0',
    icon: '♪',
    targetScrapp: 'imposter-dance',
    minScrappVersion: '1.0.0',
    entry: 'main.js',
    enabled: true,
    files: { 'lib.js': 'var lib = 1;', 'main.js': 'if (!lib) throw new Error("lib");' }
  }],
  scrapp: scrapp,
  evalSource: (code) => { box.code = (box.code || '') + code; },
  dispatch: (value) => { detail = value; }
});
assert.ok(box.code.indexOf('var lib') < box.code.indexOf('if (!lib)'));
assert.strictEqual(detail.loaded[0].id, 'dance-tools');
assert.deepStrictEqual(detail.errors, []);

console.log('ok addons');
