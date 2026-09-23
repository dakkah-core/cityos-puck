import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCityOSPuckRegistration, digestCityOSPuckRegistration, bindCityOSPuckRegistration } from '../../packages/core/cityos-registration.ts';
const digest = 'sha256:' + 'a'.repeat(64);
const ref = { key: 'fixture.text', version: '1', digest };
const entry = (type = 'FixtureText') => ({ type, label: 'نص / Text', renderer: { ...ref }, fields: { text: { type: 'text', label: 'النص' } } });
const fixture = (entries = [entry()]) => ({ schemaVersion: 'cityos.puck.registration.v1', dataProfile: 'cityos.puck-slots.v0.23.native-screen.v2', source: { ownerId: 'core.cms', registryRevision: 'fixture-v1', definitionDigest: digest }, components: entries });
const library = () => new Map([[ref.key, { kind: 'component', version: '1', digest, enabled: true, render: props => ({ text: props.text }) }]]);
const bind = async (input, installed = library()) => bindCityOSPuckRegistration(input, await digestCityOSPuckRegistration(input), key => installed.get(key));
test('new metadata-only component types bind installed renderers without a source list', async () => {
  const config = await bind(fixture([entry(), entry('FutureHeading')]));
  assert.deepEqual(Object.keys(config.components), ['FixtureText', 'FutureHeading']);
  assert.deepEqual(config.components.FutureHeading.render({ text: 'generated' }), { text: 'generated' });
});
test('manifest hashing is independent of object key insertion order', async () => {
  const value = fixture(), reversed = Object.fromEntries(Object.entries(value).reverse());
  assert.equal(await digestCityOSPuckRegistration(value), await digestCityOSPuckRegistration(reversed));
});
test('changed metadata fails exact independently supplied manifest digest', async () => {
  const value = fixture(), hash = await digestCityOSPuckRegistration(value);value.components[0].label = 'changed';
  await assert.rejects(bindCityOSPuckRegistration(value, hash, key => library().get(key)), /MANIFEST_MISMATCH/);
});
test('missing or mismatched installed code cannot be manufactured by metadata', async () => {
  const input = fixture();
  for (const change of [{ enabled: false }, { version: '2' }, { digest: 'sha256:' + 'b'.repeat(64) }, { kind: 'root' }, { render: null }]) {
    const installed = library();Object.assign(installed.get(ref.key), change);await assert.rejects(bind(input, installed), /RENDERER_UNAVAILABLE/);
  }
  await assert.rejects(bind(input, new Map()), /RENDERER_UNAVAILABLE/);
});
test('revoking code also denies execution through an already bound config', async () => {
  const installed = library(), config = await bind(fixture(), installed);installed.get(ref.key).enabled = false;
  assert.throws(() => config.components.FixtureText.render({ text: 'must not render' }), /RENDERER_UNAVAILABLE/);
});
test('replacing a function without changing the claimed version cannot reuse old config', async () => {
  const installed = library(), config = await bind(fixture(), installed);installed.get(ref.key).render = () => 'replacement';
  assert.throws(() => config.components.FixtureText.render({}), /RENDERER_CHANGED/);
});
test('duplicate types, unsafe keys and system-managed fields reject', () => {
  assert.throws(() => parseCityOSPuckRegistration(fixture([entry(),entry()])), /DUPLICATE/);
  for (const field of ['id','type','puck','editMode']) {
    const v = fixture();v.components[0].fields = { [field]: { type:'text', label:'unsafe' } };assert.throws(() => parseCityOSPuckRegistration(v), /SYSTEM_FIELD/);
  }
  assert.throws(() => parseCityOSPuckRegistration(JSON.parse('{"__proto__":{}}')), /DATA_ONLY/);
});
test('arbitrary URLs, permissions and executable hooks are not registration data', () => {
  for (const extra of [{ importUrl: 'https://untrusted.invalid/module.js' }, { permissions: { edit: true } }, { defaultProps: { hidden:'secret' } }]) {
    const v = fixture();Object.assign(v.components[0],extra);assert.throws(() => parseCityOSPuckRegistration(v), /SHAPE/);
  }
  const v = fixture();v.components[0].renderer.key = 'https://untrusted.invalid';assert.throws(() => parseCityOSPuckRegistration(v), /KEY/);
});
test('accessor source is rejected without executing it', () => {
  let called = false;const value = Object.defineProperty({}, 'components', { enumerable:true, get(){called=true;return [];} });
  assert.throws(() => parseCityOSPuckRegistration(value), /DATA_ONLY/);assert.equal(called,false);
});
test('functions, cycles, sparse arrays and custom prototypes reject', () => {
  for (const value of [()=>true, new Date(), [,entry()]]) assert.throws(() => parseCityOSPuckRegistration(value), /DATA_ONLY/);
  const cyclic=fixture();cyclic.self=cyclic;assert.throws(() => parseCityOSPuckRegistration(cyclic), /DATA_ONLY/);
});
test('unsupported fields cannot silently downgrade to text', () => {
  const v=fixture();v.components[0].fields.text.type='richtext';assert.throws(() => parseCityOSPuckRegistration(v), /UNSUPPORTED_FIELD/);
});
test('number limits and select uniqueness are checked', () => {
  const v=fixture();v.components[0].fields={n:{type:'number',label:'N',min:10,max:1}};assert.throws(() => parseCityOSPuckRegistration(v), /NUMBER_BOUNDS/);
  v.components[0].fields={n:{type:'select',label:'N',options:[{label:'a',value:1},{label:'b',value:1}]}};assert.throws(() => parseCityOSPuckRegistration(v), /OPTIONS/);
});
test('slot allow lists resolve only registered component types', async () => {
  const v=fixture([entry(),entry('Container')]);v.components[1].fields={content:{type:'slot',label:'Content',allow:['FixtureText']}};
  assert.equal((await bind(v)).components.Container.fields.content.type,'slot');
  v.components[1].fields.content.allow=['Missing'];assert.throws(() => parseCityOSPuckRegistration(v), /SLOT_REFERENCE/);
});
test('root rendering is bound separately from ordinary component rendering', async () => {
  const v=fixture();v.root={label:'Screen',renderer:{...ref,key:'fixture.root'},fields:{title:{type:'textarea',label:'Title'}}};
  const installed=library();installed.set('fixture.root',{...installed.get(ref.key),kind:'root'});
  assert.ok((await bind(v,installed)).root.render);
});
test('parsed source is isolated/frozen and binding does not fill default properties', async () => {
  const v=fixture(), original=JSON.stringify(v), parsed=parseCityOSPuckRegistration(v), config=await bind(v);
  assert.equal(JSON.stringify(v),original);assert.ok(Object.isFrozen(parsed.components[0].fields));
  config.components.FixtureText.fields.text.label='local';assert.equal(v.components[0].fields.text.label,'النص');
  assert.equal(Object.hasOwn(config.components.FixtureText,'defaultProps'),false);
});
test('source identity and data profile must be explicit', () => {
  const v=fixture();v.source.ownerId='VSYS-01';assert.throws(() => parseCityOSPuckRegistration(v), /OWNER_REFERENCE/);
  v.source.ownerId='core.cms';v.dataProfile='unknown';assert.throws(() => parseCityOSPuckRegistration(v), /PROFILE/);
});
test('source mutation while digest is pending cannot replace the captured target', async () => {
  const v=fixture(), expected=await digestCityOSPuckRegistration(v), installed=library();
  const pending=bindCityOSPuckRegistration(v,expected,key=>installed.get(key));v.components[0].type='Changed';
  assert.ok((await pending).components.FixtureText);
});
test('oversized input is rejected before binding executable code', () => {
  const v=fixture();v.components=Array.from({length:1025},(_,i)=>entry('Type'+i));assert.throws(() => parseCityOSPuckRegistration(v), /COMPONENT_LIMIT/);
});
