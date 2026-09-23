import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindCityOSPuckRegistration, digestCityOSPuckRegistration, parseCityOSPuckRegistration } from '../../packages/core/cityos-registration.ts';

const digest = 'sha256:' + 'a'.repeat(64);
const source = () => ({
  schemaVersion: 'cityos.puck.registration.v1',
  dataProfile: 'cityos.puck-slots.v0.23.native-screen.v2',
  source: { ownerId: 'core.cms', registryRevision: 'fixture', definitionDigest: digest },
  components: [{
    type: 'Container', label: 'Container',
    renderer: { key: 'fixture.container', version: '1', digest },
    fields: {
      text: { type: 'text', label: 'Text' },
      description: { type: 'textarea', label: 'Description' },
      size: { type: 'number', label: 'Size', min: 0, max: 10, step: 0.5 },
      choice: { type: 'select', label: 'Choice', options: [{ label: 'No', value: false }, { label: 'Empty', value: null }] },
      content: { type: 'slot', label: 'Content', allow: ['Container'] },
    },
  }],
});
const renderer = { kind: 'component', version: '1', digest, enabled: true, render: props => props };

test('all admitted field variants retain their complete values without a JSON-to-Field cast', async () => {
  const input = source();
  const config = await bindCityOSPuckRegistration(input, await digestCityOSPuckRegistration(input), () => renderer);
  assert.deepEqual(config.components.Container.fields, input.components[0].fields);
});
test('Puck field mutations do not alias source options, slots or a second binding', async () => {
  const input = source(), expected = await digestCityOSPuckRegistration(input);
  const a = await bindCityOSPuckRegistration(input, expected, () => renderer);
  const b = await bindCityOSPuckRegistration(input, expected, () => renderer);
  a.components.Container.fields.choice.options[0].label = 'changed';
  a.components.Container.fields.content.allow.push('Other');
  a.components.Container.fields.size.max = 999;
  assert.deepEqual(b.components.Container.fields, input.components[0].fields);
  assert.equal(input.components[0].fields.choice.options[0].label, 'No');
  assert.deepEqual(input.components[0].fields.content.allow, ['Container']);
  assert.equal(input.components[0].fields.size.max, 10);
  assert.equal(await digestCityOSPuckRegistration(input), expected);
});
test('own-property validation works without requiring the ES2022 Object.hasOwn helper', () => {
  const original = Object.hasOwn;
  try {
    Object.hasOwn = undefined;
    assert.equal(parseCityOSPuckRegistration(source()).components[0].type, 'Container');
    const invalid = source();
    delete invalid.source.ownerId;
    assert.throws(() => parseCityOSPuckRegistration(invalid), /SHAPE/);
  } finally { Object.hasOwn = original; }
});
test('unsupported executable fields still reject instead of being cast into Puck types', () => {
  const input = source();
  input.components[0].fields.text = { type: 'custom', label: 'Unsafe', render: () => 'unsafe' };
  assert.throws(() => parseCityOSPuckRegistration(input), /DATA_ONLY/);
});
