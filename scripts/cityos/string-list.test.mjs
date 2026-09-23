import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseCityOSPuckRegistration, digestCityOSPuckRegistration, bindCityOSPuckRegistration } from '../../packages/core/cityos-registration.ts';
import { snapshotCityOSStringList, editCityOSStringList } from '../../packages/core/cityos-string-list.ts';

const bytes=readFileSync(new URL('./fixtures/compiler-registration.v3.json',import.meta.url),'utf8');
const proof=JSON.parse(readFileSync(new URL('./fixtures/compiler-registration.v3.evidence.json',import.meta.url),'utf8'));
const fixture=()=>JSON.parse(bytes);
const bounds={maxItems:6,maxItemLength:80};
const installed=(kind='component')=>({kind,version:'1',digest:'sha256:'+'a'.repeat(64),enabled:true,render:props=>props});
// This injected adapter exercises the data binder only. Actual React controls have separate Jest tests.
const adapters={stringList:field=>({type:'custom',label:field.label,render:props=>props})};
const bind=(input=fixture(),digest=proof.registrationDigest,resolver=key=>installed(key==='fixture.root'?'root':'component'))=>bindCityOSPuckRegistration(input,digest,resolver,adapters);

test('actual compiler native catalog binds eleven components and a root with independent digests',async()=>{
 assert.equal(proof.qualificationOnly,true);
 assert.equal('sha256:'+createHash('sha256').update(bytes).digest('hex'),proof.artifactDigest);
 assert.equal(await digestCityOSPuckRegistration(fixture()),proof.registrationDigest);
 assert.notEqual(proof.registrationDigest,proof.artifactDigest);
 const source=parseCityOSPuckRegistration(fixture());
 assert.equal(source.schemaVersion,'cityos.puck.registration.v3');
 assert.equal(source.components.length,11);assert.ok(source.root);
 const list=source.components.find(x=>x.type==='StudioList');
 assert.deepEqual(list.fields.items,{type:'string-list',label:'عناصر القائمة',maxItems:100,maxItemLength:2000});
 const config=await bind();assert.equal(Object.keys(config.components).length,11);
 assert.equal(config.components.StudioList.fields.items.type,'custom');
 assert.equal(Object.hasOwn(config.components.StudioList,'defaultProps'),false);
});
test('new names bind supported list primitives without another hardcoded component switch',async()=>{
 const m=fixture();m.components=m.components.filter(x=>x.type==='StudioList');delete m.root;
 m.components[0].type='FutureList';const config=await bind(m,await digestCityOSPuckRegistration(m));
 assert.ok(config.components.FutureList.fields.items);
});
test('older target versions still reject string-list metadata',()=>{
 for(const version of ['v1','v2']){const m=fixture();m.schemaVersion='cityos.puck.registration.'+version;
 assert.throws(()=>parseCityOSPuckRegistration(m),/UNSUPPORTED_FIELD/);}
});
test('missing installed field implementation does not produce a dummy control',async()=>{
 await assert.rejects(bindCityOSPuckRegistration(fixture(),proof.registrationDigest,key=>installed(key==='fixture.root'?'root':'component')),/FIELD_ADAPTER_UNAVAILABLE/);
});
test('target rejects source callbacks and invalid list limits',()=>{
 for(const change of [f=>{f.maxItems=1001;},f=>{f.maxItemLength=-1;},f=>{f.maxItems=1.5;},f=>{delete f.maxItems;},f=>{f.render='arbitrary';}]){
 const m=fixture();change(m.components.find(x=>x.type==='StudioList').fields.items);
 assert.throws(()=>parseCityOSPuckRegistration(m),/CITYOS_PUCK_/);}
});
test('metadata tampering and wrong digest fail before renderer lookup',async()=>{
 const m=fixture();m.components.find(x=>x.type==='StudioList').fields.items.maxItems=99;
 let lookups=0;await assert.rejects(bind(m,proof.registrationDigest,()=>{lookups++;return installed();}),/MANIFEST_MISMATCH/);
 assert.equal(lookups,0);await assert.rejects(bind(fixture(),proof.artifactDigest),/MANIFEST_MISMATCH/);
});
test('cached renderer checks still honor disablement',async()=>{
 const renderer=installed();const config=await bind(fixture(),proof.registrationDigest,key=>key==='fixture.root'?installed('root'):renderer);
 renderer.enabled=false;assert.throws(()=>config.components.StudioList.render({items:[]}),/RENDERER_UNAVAILABLE/);
});
test('bound fields are session-local without changing the admitted manifest',async()=>{
 const input=fixture(),first=await bind(input),second=await bind(input);
 first.components.StudioList.fields.items.label='local';
 assert.equal(second.components.StudioList.fields.items.label,'عناصر القائمة');
 assert.equal(input.components.find(x=>x.type==='StudioList').fields.items.label,'عناصر القائمة');
});
test('nested lists use the same trusted field adapter',async()=>{
 const m=fixture();m.components=m.components.filter(x=>x.type==='StudioList');delete m.root;
 m.components[0].fields={details:{type:'object',label:'Details',objectFields:{items:m.components[0].fields.items}}};
 const config=await bind(m,await digestCityOSPuckRegistration(m));
 assert.equal(config.components.StudioList.fields.details.objectFields.items.type,'custom');
});
test('snapshot preserves whitespace, duplicates, empty strings and embedded newlines',()=>{
 const input=['','same','same','  spaced  ','first\nsecond','نص'];
 const copied=snapshotCityOSStringList(input,bounds);assert.deepEqual(copied,input);assert.notEqual(copied,input);assert.ok(Object.isFrozen(copied));
 assert.equal(snapshotCityOSStringList(undefined,bounds),undefined);
});
test('invalid values are rejected without trimming, unpacking or dropping items',()=>{
 for(const value of [null,'one\ntwo',[{value:'one'}],[null],[1],['\0'],['x'.repeat(81)],Array(7).fill('x'),Array(2)])assert.throws(()=>snapshotCityOSStringList(value,bounds),/VALUE/);
});
test('accessors and extra keys are rejected without invoking accessors',()=>{
 let calls=0;const a=['x'];Object.defineProperty(a,'0',{enumerable:true,get(){calls++;return'x';}});
 assert.throws(()=>snapshotCityOSStringList(a,bounds),/VALUE/);assert.equal(calls,0);
 const b=['x'];b.extra='x';assert.throws(()=>snapshotCityOSStringList(b,bounds),/VALUE/);
});
test('explicit operations preserve scalar shape and do not mutate input',()=>{
 const input=['same','same','\n'];
 assert.deepEqual(editCityOSStringList(input,bounds,{type:'set',index:1,value:'  edit  '}),['same','  edit  ','\n']);
 assert.deepEqual(editCityOSStringList(input,bounds,{type:'move',from:2,to:0}),['\n','same','same']);
 assert.deepEqual(editCityOSStringList(input,bounds,{type:'remove',index:1}),['same','\n']);
 assert.deepEqual(editCityOSStringList(input,bounds,{type:'insert',index:3,value:''}),['same','same','\n','']);
 assert.deepEqual(input,['same','same','\n']);
});
test('missing values stay absent until an explicit insertion',()=>{
 assert.equal(snapshotCityOSStringList(undefined,bounds),undefined);
 assert.deepEqual(editCityOSStringList(undefined,bounds,{type:'insert',index:0,value:''}),['']);
});
test('capacity and item bounds apply to every edit path',()=>{
 assert.throws(()=>editCityOSStringList(['a'],{maxItems:1,maxItemLength:3},{type:'insert',index:1,value:'b'}),/CAPACITY/);
 assert.throws(()=>editCityOSStringList(['a'],{maxItems:1,maxItemLength:3},{type:'set',index:0,value:'long'}),/VALUE/);
 assert.deepEqual(snapshotCityOSStringList([],{maxItems:0,maxItemLength:0}),[]);
});
test('invalid indices cannot create sparse arrays or splice an unintended item',()=>{
 for(const index of [-1,1,NaN,0.5])assert.throws(()=>editCityOSStringList(['a'],bounds,{type:'set',index,value:'b'}),/INDEX/);
 assert.throws(()=>editCityOSStringList([],bounds,{type:'remove',index:0}),/INDEX/);
 assert.throws(()=>editCityOSStringList(['a'],bounds,{type:'move',from:0,to:1}),/INDEX/);
});
