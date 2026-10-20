import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,realpathSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import * as YAML from 'yaml';

const root=fileURLToPath(new URL('../../',import.meta.url));
const fromRoot=createRequire(path.join(root,'package.json'));
const workspace=YAML.parse(readFileSync(path.join(root,'pnpm-workspace.yaml'),'utf8'));
test('the actual ESLint resolver uses the stable owning catalog contract',()=>{
  assert.equal(workspace.overrides['eslint-import-resolver-node@0.3.10>resolve'],'catalog:');
  const entry=fromRoot.resolve('eslint-import-resolver-node');
  const fromResolver=createRequire(entry);
  const resolverManifest=JSON.parse(readFileSync(fromResolver.resolve('eslint-import-resolver-node/package.json'),'utf8'));
  assert.equal(resolverManifest.version,'0.3.10');
  const dependency=JSON.parse(readFileSync(fromResolver.resolve('resolve/package.json'),'utf8'));
  assert.equal(dependency.version,workspace.catalog.resolve);
  assert.match(dependency.version,/^\d+\.\d+\.\d+$/u);
  const resolver=fromRoot(entry);
  assert.equal(resolver.interfaceVersion,2);
  const temporaryBase=realpathSync(os.tmpdir());
  const prefix='cityos-stable-import-resolver-';
  const fixture=realpathSync(mkdtempSync(path.join(temporaryBase,prefix)));
  try{
    const write=(file,contents)=>{mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,contents);};
    const packageAt=(directory,manifest,files)=>{
      write(path.join(directory,'package.json'),JSON.stringify(manifest));
      for(const[name,contents]of Object.entries(files))write(path.join(directory,name),contents);
    };
    const entryFile=path.join(fixture,'src/entry.ts');
    write(entryFile,'export {};');
    const modules=path.join(fixture,'node_modules');
    packageAt(path.join(modules,'module-first'),{name:'module-first',module:'entry.mjs',main:'main.cjs'},{'entry.mjs':'export {};','main.cjs':'module.exports={};'});
    packageAt(path.join(modules,'fallback-entry'),{name:'fallback-entry',module:'missing.mjs','jsnext:main':'fallback.mjs',main:'main.js'},{'fallback.mjs':'export {};','main.js':'module.exports={};'});
    packageAt(path.join(modules,'ordinary-main'),{name:'ordinary-main',main:'lib/index.cjs'},{'lib/index.cjs':'module.exports={};'});
    const options={extensions:['.js','.mjs','.jsx','.ts','.tsx','.cjs']};
    for(const[name,file]of [['module-first','entry.mjs'],['fallback-entry','fallback.mjs'],['ordinary-main','lib/index.cjs']]){
      assert.deepEqual(resolver.resolve(name,entryFile,options),{found:true,path:path.join(modules,name,file)},name);
    }
    assert.deepEqual(resolver.resolve('node:fs',entryFile,options),{found:true,path:null});
    assert.deepEqual(resolver.resolve('missing-fixture-module',entryFile,options),{found:false});
    const target=path.join(fixture,'linked-source'),link=path.join(modules,'linked-module');
    packageAt(target,{name:'linked-module',main:'entry.js'},{'entry.js':'module.exports={};'});
    symlinkSync(target,link,process.platform==='win32'?'junction':'dir');
    assert.deepEqual(resolver.resolve('linked-module',entryFile,options),{found:true,path:path.join(link,'entry.js')},
      'Keep the actual consumer preserveSymlinks:true contract');
  }finally{
    assert.equal(realpathSync(path.dirname(fixture)),temporaryBase);
    assert(path.basename(fixture).startsWith(prefix));
    assert.equal(realpathSync(fixture),fixture);
    rmSync(fixture,{recursive:true,force:true,maxRetries:3,retryDelay:100});
  }
});

