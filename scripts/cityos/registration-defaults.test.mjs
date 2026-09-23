import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  parseCityOSPuckRegistration,
  bindCityOSPuckRegistration,
  digestCityOSPuckRegistration,
} from '../../packages/core/cityos-registration.ts';

// This target fixture is produced by CityOS Compiler, not hand-maintained metadata.
const bytes = readFileSync(new URL('./fixtures/compiler-registration-v4.json', import.meta.url), 'utf8');
const provenance = JSON.parse(readFileSync(new URL('./fixtures/compiler-registration-v4.provenance.json', import.meta.url), 'utf8'));
const fresh = () => JSON.parse(bytes);
function installed() {
  const entries = new Map();
  const manifest = fresh();
  for (const [kind, entry] of [...manifest.components.map(e => ['component', e]), ['root', manifest.root]]) {
    entries.set(entry.renderer.key, { kind, version: entry.renderer.version, digest: entry.renderer.digest,
      enabled: true, render: props => props });
  }
  return { entries, resolve: key => entries.get(key) };
}
const adapters = { stringList: () => ({ type: 'custom', render: () => null }) };
const bind = (manifest = fresh(), state = installed()) =>
  bindCityOSPuckRegistration(manifest, provenance.registrationDigest, state.resolve, adapters);
function reject(name, edit, pattern = /CITYOS_PUCK_/) {
  test(name, () => { const data = fresh(); edit(data); assert.throws(() => parseCityOSPuckRegistration(data), pattern); });
}

test('accepts exact compiler bytes with distinct byte and normalized protocol hashes', async () => {
  assert.equal('sha256:' + createHash('sha256').update(bytes).digest('hex'), provenance.artifactDigest);
  assert.equal(await digestCityOSPuckRegistration(fresh()), provenance.registrationDigest);
  assert.notEqual(provenance.artifactDigest, provenance.registrationDigest);
});
test('binds authored defaults only to component creation', async () => {
  const config = await bind();
  assert.deepEqual(config.components.Card.defaultProps, fresh().components[0].defaultProps);
  assert.equal(Object.hasOwn(config.root, 'defaultProps'), false);
});
test('keeps omitted values omitted when rendering existing props', async () => {
  const config = await bind(); const props = { id: 'existing' };
  assert.equal(config.components.Card.render(props), props);
  assert.deepEqual(props, { id: 'existing' });
});
test('does not fill root values on binding or rendering', async () => {
  const config = await bind(); const existing = { id: 'root' };
  assert.equal(config.root.render(existing), existing); assert.equal(Object.hasOwn(existing, 'title'), false);
});
test('keeps false, zero, empty strings, duplicates and newline values', async () => {
  const props = (await bind()).components.Card.defaultProps;
  assert.equal(props.enabled, false); assert.equal(props.count, 0);
  assert.deepEqual(props.tags, ['', 'أ\nب', 'أ\nب']); assert.deepEqual(props.metadata, {});
});
test('deeply freezes admitted source, but gives each binding its own mutable defaults', async () => {
  const raw = fresh(), snapshot = parseCityOSPuckRegistration(raw);
  assert.equal(Object.isFrozen(snapshot.components[0].defaultProps.rows[0]), true);
  const one = await bind(raw), two = await bind(raw);
  one.components.Card.defaultProps.rows[0].text = 'changed';
  one.components.Card.defaultProps.tags.push('changed');
  assert.equal(two.components.Card.defaultProps.rows[0].text, 'الأولى');
  assert.equal(raw.components[0].defaultProps.rows[0].text, 'الأولى');
  assert.equal(two.components.Card.defaultProps.tags.length, 3);
});
test('snapshots defaults before asynchronous hashing', async () => {
  const raw = fresh(); const pending = bind(raw); raw.components[0].defaultProps.title = 'changed after call';
  assert.equal((await pending).components.Card.defaultProps.title, 'بطاقة جديدة');
});
test('refuses tampered default with the original admission digest', async () => {
  const data = fresh(); data.components[0].defaultProps.title = 'changed';
  await assert.rejects(bind(data), /MANIFEST_MISMATCH/);
});
test('artifact byte hash cannot replace normalized protocol hash', async () => {
  await assert.rejects(bindCityOSPuckRegistration(fresh(), provenance.artifactDigest, installed().resolve, adapters), /MANIFEST_MISMATCH/);
});
test('defaults cannot reactivate a disabled renderer', async () => {
  const state = installed(); state.entries.get('fixture.Card').enabled = false;
  await assert.rejects(bind(fresh(), state), /RENDERER_UNAVAILABLE/);
});
test('cached render still checks renderer revocation', async () => {
  const state = installed(), config = await bind(fresh(), state);
  state.entries.get('fixture.Card').enabled = false;
  assert.throws(() => config.components.Card.render({}), /RENDERER_UNAVAILABLE/);
});
test('retains changed-implementation rejection after binding defaults', async () => {
  const state = installed(), config = await bind(fresh(), state);
  state.entries.get('fixture.Card').render = () => null;
  assert.throws(() => config.components.Card.render({}), /RENDERER_CHANGED/);
});
test('does not supply missing string-list executable implementation', async () => {
  await assert.rejects(bindCityOSPuckRegistration(fresh(), provenance.registrationDigest, installed().resolve, {}), /FIELD_ADAPTER_UNAVAILABLE/);
});
for (const version of [1, 2, 3]) {
  reject(`v${version} cannot silently receive creation defaults`, d => { d.schemaVersion = `cityos.puck.registration.v${version}`; });
}
reject('v4 requires explicit component defaults even when empty', d => { delete d.components[0].defaultProps; });
reject('root defaults cannot backfill an existing root', d => { d.root.defaultProps = { title: 'do not restore withheld data' }; }, /SHAPE/);
reject('undeclared default fields fail', d => { d.components[0].defaultProps.unknown = 1; });
reject('default identity fails', d => { d.components[0].defaultProps.id = 'forged'; });
reject('default slots cannot hide an inserted document', d => { d.components[0].defaultProps.children = []; }, /DEFAULT_SLOT/);
reject('wrong numeric type fails', d => { d.components[0].defaultProps.count = '1'; }, /DEFAULT_VALUE/);
reject('out-of-bounds integer fails', d => { d.components[0].defaultProps.count = 9; }, /DEFAULT_VALUE/);
reject('fractional integer default fails', d => { d.components[0].defaultProps.count = 0.5; }, /DEFAULT_VALUE/);
reject('invalid selection fails', d => { d.components[0].defaultProps.alignment = 'middle'; }, /DEFAULT_VALUE/);
reject('boolean strings are not coerced', d => { d.components[0].defaultProps.enabled = 'false'; }, /DEFAULT_VALUE/);
reject('string-list bounds are enforced', d => { d.components[0].defaultProps.tags = ['a', 'b', 'c', 'd']; }, /DEFAULT_VALUE/);
reject('record arrays are not scalar lists', d => { d.components[0].defaultProps.rows = ['item']; });
reject('record-array count is bounded', d => { d.components[0].defaultProps.rows = [{}, {}, {}]; }, /DEFAULT_VALUE/);
reject('unknown nested fields fail', d => { d.components[0].defaultProps.rows[0].unknown = true; });
reject('control characters fail', d => { d.components[0].defaultProps.title = '\u0000'; }, /DEFAULT_VALUE/);
reject('metadata cannot contain executable default functions', d => { d.components[0].defaultProps.title = () => 'execute'; }, /DATA_ONLY/);
reject('prototype-pollution keys fail before binding', d => { d.components[0].defaultProps.metadata = JSON.parse('{"__proto__":{"polluted":true}}'); }, /DATA_ONLY/);
test('default getters are rejected without invocation', () => {
  const data = fresh(); let calls = 0;
  Object.defineProperty(data.components[0].defaultProps, 'title', { enumerable: true, get() { calls++; return 'bad'; } });
  assert.throws(() => parseCityOSPuckRegistration(data), /DATA_ONLY/); assert.equal(calls, 0);
});
