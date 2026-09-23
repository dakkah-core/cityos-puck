import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseCityOSPuckRegistration, digestCityOSPuckRegistration, bindCityOSPuckRegistration } from '../../packages/core/cityos-registration.ts';

// Generated conformance data, not another compiler or a runtime admission record.
const bytes = readFileSync(new URL('./fixtures/compiler-registration.v2.json', import.meta.url), 'utf8');
const proof = JSON.parse(readFileSync(new URL('./fixtures/compiler-registration.v2.evidence.json', import.meta.url), 'utf8'));
const fixture = () => JSON.parse(bytes);
const installed = () => ({ kind: 'component', version: '1.0.0', digest: 'sha256:' + 'a'.repeat(64), enabled: true, render: props => props });
const bind = (renderer = installed()) => bindCityOSPuckRegistration(fixture(), proof.registrationDigest, key => key === 'cityos.StructuredCard' ? renderer : undefined);

test('v2 compiler artifact has independently checked byte and protocol digests', async () => {
  assert.equal(proof.qualificationOnly, true);
  assert.match(proof.compilerSourceBlob, /^[a-f0-9]{40}$/);
  assert.equal('sha256:' + createHash('sha256').update(bytes).digest('hex'), proof.artifactDigest);
  assert.equal(await digestCityOSPuckRegistration(fixture()), proof.registrationDigest);
  assert.notEqual(proof.artifactDigest, proof.registrationDigest);
  assert.equal(parseCityOSPuckRegistration(fixture()).schemaVersion, 'cityos.puck.registration.v2');
});

test('actual generated Arabic object, record-array and Boolean fields bind without conversion', async () => {
  const config = await bind();
  const fields = config.components.StructuredCard.fields;
  assert.equal(fields.details.type, 'object');
  assert.equal(fields.details.label, 'التفاصيل');
  assert.deepEqual(fields.details.objectFields.title, { type: 'text', label: 'العنوان' });
  assert.equal(fields.items.type, 'array');
  assert.equal(fields.items.min, 1); assert.equal(fields.items.max, 3);
  assert.deepEqual(fields.items.arrayFields.visible.options, [{ value: true, label: 'نعم' }, { value: false, label: 'لا' }]);
  const props = { details: { title: 'اختبار' }, items: [{ title: 'الأول', visible: false }] };
  assert.deepEqual(config.components.StructuredCard.render(props), props);
  assert.equal(Object.hasOwn(config.components.StructuredCard, 'defaultProps'), false);
});

test('nested mutable editor fields do not mutate admitted data or another session', async () => {
  const input = fixture(), parsed = parseCityOSPuckRegistration(input);
  const first = await bind(), second = await bind();
  first.components.StructuredCard.fields.items.arrayFields.title.label = 'local';
  first.components.StructuredCard.fields.items.arrayFields.visible.options[0].label = 'local';
  assert.equal(second.components.StructuredCard.fields.items.arrayFields.title.label, 'العنوان');
  assert.equal(parsed.components[0].fields.items.arrayFields.visible.options[0].label, 'نعم');
  assert.ok(Object.isFrozen(parsed.components[0].fields.items.arrayFields));
});

test('v1 cannot implicitly consume structured v2 fields', () => {
  const input = fixture(); input.schemaVersion = 'cityos.puck.registration.v1';
  assert.throws(() => parseCityOSPuckRegistration(input), /UNSUPPORTED_FIELD/);
});

test('changed generated metadata cannot reuse the original admission digest', async () => {
  const input = fixture(); input.components[0].fields.items.max = 4;
  await assert.rejects(bindCityOSPuckRegistration(input, proof.registrationDigest, () => installed()), /MANIFEST_MISMATCH/);
  await assert.rejects(bindCityOSPuckRegistration(fixture(), proof.artifactDigest, () => installed()), /MANIFEST_MISMATCH/);
});

test('generated nested field limits are enforced at the receiving fork too', () => {
  const input = fixture(); input.components[0].fields.items.max = 1001;
  assert.throws(() => parseCityOSPuckRegistration(input), /ARRAY_BOUNDS/);
  const path = fixture(); path.components[0].fields.details.objectFields['unsafe.path'] = { type: 'text', label: 'Invalid' };
  assert.throws(() => parseCityOSPuckRegistration(path), /FIELD_NAME/);
});

test('structured rendering still denies missing and revoked installed implementations', async () => {
  await assert.rejects(bindCityOSPuckRegistration(fixture(), proof.registrationDigest, () => undefined), /RENDERER_UNAVAILABLE/);
  const renderer = installed(), config = await bind(renderer);
  renderer.enabled = false;
  assert.throws(() => config.components.StructuredCard.render({}), /RENDERER_UNAVAILABLE/);
});

test('data-only snapshot preserves explicit null and false scalar options', () => {
  const input = fixture(); input.components[0].fields.choice = { type: 'radio', label: 'Choice', options: [
    { label: 'None', value: null }, { label: 'No', value: false },
  ] };
  assert.deepEqual(parseCityOSPuckRegistration(input).components[0].fields.choice.options.map(o => o.value), [null, false]);
});
