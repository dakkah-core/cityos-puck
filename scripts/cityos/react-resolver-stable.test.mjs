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

test('React lint detection binds stable resolve with the explicit original symlink policy',()=>{
  assert.equal(workspace.overrides['eslint-plugin-react@7.37.5>resolve'],'catalog:');
  const patch=workspace.patchedDependencies['eslint-plugin-react@7.37.5'];
  assert.equal(patch,'patches/eslint-plugin-react@7.37.5.resolve-stable.patch');
  const entry=fromRoot.resolve('eslint-plugin-react/lib/util/version.js');
  const fromPlugin=createRequire(entry);
  const manifest=JSON.parse(readFileSync(fromPlugin.resolve('eslint-plugin-react/package.json'),'utf8'));
  assert.equal(manifest.version,'7.37.5');
  const dependency=JSON.parse(readFileSync(fromPlugin.resolve('resolve/package.json'),'utf8'));
  assert.equal(dependency.version,workspace.catalog.resolve);
  assert.match(dependency.version,/^\d+\.\d+\.\d+$/u);
  const installed=readFileSync(entry,'utf8');
  assert.equal((installed.match(/preserveSymlinks: false/gu)??[]).length,2,
    'Both actual React and Flow detection must retain the prerelease resolver realpath behavior');
  const patchSource=readFileSync(path.join(root,patch),'utf8');
  assert(patchSource.includes('const reactPath = resolveReactPath(basedir);'));
  assert(patchSource.includes("error.code = 'INCORRECT_PACKAGE_MAIN'"));
});

test('actual React and Flow detection preserves ordinary, linked and fallback behavior',t=>{
  const version=fromRoot('eslint-plugin-react/lib/util/version.js');
  const reset=()=>{version.resetWarningFlag();version.resetDetectedVersion();version.resetDefaultVersion();};
  const temporaryBase=realpathSync(os.tmpdir());
  const prefix='cityos-stable-react-resolver-';
  const fixture=realpathSync(mkdtempSync(path.join(temporaryBase,prefix)));
  const warnings=[];
  t.mock.method(console,'error',message=>warnings.push(String(message)));
  const write=(file,contents)=>{mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,contents);};
  const packages=(parent,reactVersion,flowVersion)=>{
    write(path.join(parent,'node_modules/react/package.json'),JSON.stringify({name:'react',version:reactVersion,main:'index.js'}));
    write(path.join(parent,'node_modules/react/index.js'),'exports.version='+JSON.stringify(reactVersion)+';');
    write(path.join(parent,'node_modules/flow-bin/package.json'),JSON.stringify({name:'flow-bin',version:flowVersion}));
  };
  const context=filename=>({getFilename:()=>filename,settings:{react:{version:'detect',flowVersion:'detect'}}});
  try{
    reset();
    assert(version.testReactVersion(context(path.join(root,'package.json')),workspace.catalog.react),
      'Qualify the actual owning catalog React package as well as fixtures');

    const ordinary=path.join(fixture,'ordinary');
    const ordinaryEntry=path.join(ordinary,'src/index.js');
    write(ordinaryEntry,'module.exports={};');
    packages(ordinary,'19.3.1','0.300.0');
    reset();
    assert(version.testReactVersion(context(ordinaryEntry),'19.3.1'));
    assert(version.testFlowVersion(context(ordinaryEntry),'0.300.0'));

    const physicalParent=path.join(fixture,'physical'),linkParent=path.join(fixture,'facade');
    const physicalProject=path.join(physicalParent,'project'),linkedProject=path.join(linkParent,'project');
    write(path.join(physicalProject,'src/index.js'),'module.exports={};');
    mkdirSync(linkParent,{recursive:true});
    packages(physicalParent,'18.3.1','0.250.0');
    packages(linkParent,'19.0.0','0.260.0');
    symlinkSync(physicalProject,linkedProject,process.platform==='win32'?'junction':'dir');
    const linkedEntry=path.join(linkedProject,'src/index.js');
    reset();
    assert(version.testReactVersion(context(linkedEntry),'18.3.1'),
      'Resolve from the physical project parent, preserving the old default');
    assert.equal(version.testReactVersion(context(linkedEntry),'19.0.0'),false);
    assert(version.testFlowVersion(context(linkedEntry),'0.250.0'));
    assert.equal(version.testFlowVersion(context(linkedEntry),'0.260.0'),false);

    for(const withAncestor of [false,true]){
      const parent=path.join(fixture,'broken-'+withAncestor),project=path.join(parent,'project');
      const brokenEntry=path.join(project,'src/index.js');
      write(brokenEntry,'module.exports={};');
      write(path.join(project,'node_modules/react/package.json'),JSON.stringify({name:'react',main:'missing.js'}));
      if(withAncestor)packages(parent,'19.3.1','0.300.0');
      reset();
      assert.throws(()=>version.testReactVersion(context(brokenEntry),'19.3.1'),error=>
        error.code==='INCORRECT_PACKAGE_MAIN'&&error.message==="Cannot find module '"+
          path.join(project,'node_modules/react/missing.js')+"'. Please verify that the package.json has a valid \"main\" entry",
        'An unusable local main must not fall back to an ancestor React or a configured default');
    }
    const fallbackProject=path.join(fixture,'index-fallback');
    const fallbackEntry=path.join(fallbackProject,'src/index.js');
    write(fallbackEntry,'module.exports={};');
    write(path.join(fallbackProject,'node_modules/react/package.json'),JSON.stringify({name:'react',main:'missing.js'}));
    write(path.join(fallbackProject,'node_modules/react/index.js'),"exports.version='18.2.0';");
    reset();
    assert(version.testReactVersion(context(fallbackEntry),'18.2.0'),'Retain the supported index fallback');

    const absenceRoot=path.join(fixture,'without-packages');
    const absent=path.join(absenceRoot,'src/index.js');
    write(absent,'module.exports={};');
    packages(fixture,'99.0.0','0.999.0');
    const fromPlugin=createRequire(fromRoot.resolve('eslint-plugin-react/lib/util/version.js'));
    const resolver=fromPlugin('resolve'),actualResolve=resolver.sync;
    t.mock.method(resolver,'sync',(request,options)=>actualResolve(request,{
      ...options,
      packageIterator(name,start,thunk){
        const candidates=options.packageIterator?options.packageIterator(name,start,thunk):thunk();
        return candidates.filter(candidate=>path.resolve(candidate).startsWith(absenceRoot+path.sep));
      },
    }));
    const missing=context(absent);
    missing.settings.react.defaultVersion='17.0.2';
    reset();
    assert(version.testReactVersion(missing,'17.0.2'));
    assert(version.testFlowVersion(missing,'999.999.999'));
    assert(warnings.some(message=>message.includes('react')&&message.includes('not installed')));
    assert(warnings.some(message=>message.includes('flow-bin')&&message.includes('not installed')));
  }finally{
    reset();
    for(const filename of Object.keys(fromRoot.cache??{})){
      if(filename.startsWith(fixture+path.sep))delete fromRoot.cache[filename];
    }
    assert.equal(realpathSync(path.dirname(fixture)),temporaryBase);
    assert(path.basename(fixture).startsWith(prefix));
    assert.equal(realpathSync(fixture),fixture);
    rmSync(fixture,{recursive:true,force:true,maxRetries:3,retryDelay:100});
  }
});
