import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readJson = (...path) => JSON.parse(readFileSync(resolve(...path), 'utf8'));

test('React Router recipe typechecks always run their generated-type preparation', () => {
  const turbo = readJson('turbo.json');

  for (const recipe of ['react-router', 'react-router-ai']) {
    const manifest = readJson('recipes', recipe, 'package.json');
    const tsconfig = readJson('recipes', recipe, 'tsconfig.json');
    const task = turbo.tasks[`${manifest.name}#typecheck`];

    assert.match(manifest.scripts.typecheck, /^react-router typegen && node \.\.\/\.\.\/scripts\/toolchains\/typecheck\.mjs --noEmit$/, recipe);
    assert.ok(tsconfig.include.includes('.react-router/types/**/*'), recipe);
    assert.ok(tsconfig.compilerOptions.rootDirs.includes('./.react-router/types'), recipe);
    assert.equal(task?.cache, false, `${recipe} must not skip typegen on a cache hit`);
    assert.deepEqual(task?.dependsOn, turbo.tasks.typecheck.dependsOn, recipe);
  }

  assert.notEqual(turbo.tasks.typecheck.cache, false, 'other typechecks retain caching');
  assert.notEqual(turbo.tasks.build.cache, false, 'builds retain caching');
});

test('standalone React Router templates retain their own typegen and compiler', () => {
  for (const recipe of ['react-router', 'react-router-ai']) {
    const template = readJson('packages', 'create-puck-app', 'templates', recipe, 'package.json.hbs');
    assert.equal(template.scripts.typecheck, 'react-router typegen && tsc --noEmit', recipe);
  }
});

test('React Router build cache includes the server consumed by start', () => {
  const turbo = readJson('turbo.json');
  for (const recipe of ['react-router', 'react-router-ai']) {
    const manifest = readJson('recipes', recipe, 'package.json');
    const build = turbo.tasks[`${manifest.name}#build`];
    assert.match(manifest.scripts.start, /build\/server\/index\.js/u);
    assert.ok(build.outputs.includes('build/**'), recipe);
    assert.deepEqual(build.dependsOn, turbo.tasks.build.dependsOn, recipe);
  }
});
