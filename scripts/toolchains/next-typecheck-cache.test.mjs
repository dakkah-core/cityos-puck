import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('Turbo never reuses Next workspace typechecks that require generated output', () => {
  const config = JSON.parse(readFileSync(resolve('turbo.json'), 'utf8'));
  for (const path of ['apps/docs', 'apps/demo', 'recipes/next', 'recipes/next-ai']) {
    const manifest = JSON.parse(readFileSync(resolve(path, 'package.json'), 'utf8'));
    assert.equal(config.tasks[`${manifest.name}#typecheck`]?.cache, false, path);
    assert.deepEqual(config.tasks[`${manifest.name}#typecheck`]?.dependsOn, config.tasks.typecheck.dependsOn, path);
  }
  assert.notEqual(config.tasks.typecheck.cache, false, 'unrelated workspaces retain their existing cache policy');
});

test('Turbo does not restore Next build outputs outside the app lock', () => {
  const config = JSON.parse(readFileSync(resolve('turbo.json'), 'utf8'));
  for (const path of ['apps/docs', 'apps/demo', 'recipes/next', 'recipes/next-ai']) {
    const manifest = JSON.parse(readFileSync(resolve(path, 'package.json'), 'utf8'));
    assert.equal(config.tasks[`${manifest.name}#build`]?.cache, false, path);
    assert.deepEqual(config.tasks[`${manifest.name}#build`]?.dependsOn, config.tasks.build.dependsOn, path);
  }
  assert.notEqual(config.tasks.build.cache, false, 'unrelated workspaces retain their existing build-cache policy');
});
