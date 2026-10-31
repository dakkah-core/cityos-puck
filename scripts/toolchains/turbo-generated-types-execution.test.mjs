import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadToolchain, assertNodeVersion } from './toolchain.mjs';
import { pinnedPnpmEnvironment, resolvePinnedPnpm } from '../../packages/create-puck-app/pinned-pnpm.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const owners = ['apps/docs', 'apps/demo', 'recipes/next', 'recipes/next-ai', 'recipes/react-router', 'recipes/react-router-ai'];

test('Turbo reruns generated-type work while unrelated typechecks use cache', { timeout: 300000 }, t => {
  const toolchain = loadToolchain();
  assertNodeVersion(toolchain);
  const manager = resolvePinnedPnpm({ toolchain, root: repository });
  const environment = { ...pinnedPnpmEnvironment(process.execPath, manager), CI: '1' };
  // Never let an inherited Git worktree or Turbo remote cache redirect this
  // fixture's writes outside its temporary workspace.
  for (const key of Object.keys(environment)) if (/^(?:TURBO_|GIT_)/iu.test(key)) delete environment[key];
  environment.TURBO_TELEMETRY_DISABLED = '1';
  environment.GIT_CONFIG_NOSYSTEM = '1';
  const temp = mkdtempSync(join(tmpdir(), 'puck-turbo-types-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  environment.GIT_CONFIG_GLOBAL = join(temp, 'gitconfig');
  writeFileSync(environment.GIT_CONFIG_GLOBAL, '');
  const root = join(temp, 'workspace'), markers = join(temp, 'markers');
  mkdirSync(root); mkdirSync(markers);
  const write = (ref, bytes) => { const file = join(root, ref); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, bytes); };
  const json = (ref, value) => write(ref, JSON.stringify(value, null, 2) + '\n');
  write('turbo.json', readFileSync(join(repository, 'turbo.json')));
  write('.gitignore', 'node_modules/\n.turbo/\n.next/\n.react-router/\nbuild/\ndist/\ngenerated/\n');
  write('pnpm-workspace.yaml', 'packages:\n  - apps/*\n  - recipes/*\n  - packages/*\n');
  json('package.json', { private: true, packageManager: `pnpm@${toolchain.pnpm}` });
  const members = owners.map(ref => ({ ref, name: JSON.parse(readFileSync(join(repository, ref, 'package.json'), 'utf8')).name,
    output: ref.includes('react-router') ? '.react-router/types/routes.ts' : '.next/types/routes.d.ts' }));
  members.push({ ref: 'packages/ordinary', name: '@fixture/ordinary', output: 'generated/result.txt' });
  for (const { ref, name, output } of members) {
    json(`${ref}/package.json`, { name, version: '1.0.0', private: true, scripts: { typecheck: 'node task.cjs typecheck', build: 'node task.cjs build' } });
    const marker = join(markers, encodeURIComponent(name));
    const buildOutput = ref.includes('react-router') ? 'build/server/index.js' : 'dist/result.txt';
    write(`${ref}/task.cjs`, `const fs=require('node:fs'),path=require('node:path');const mode=process.argv[2];const marker=${JSON.stringify(marker)}+'.'+mode;const output=mode==='build'?${JSON.stringify(buildOutput)}:${JSON.stringify(output)};fs.appendFileSync(marker,'run\\n');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,'generated');\n`);
  }
  json('packages/core/package.json', { name: '@cityos-core/puck', version: '1.0.0', private: true, scripts: { build: 'node build.cjs' } });
  write('packages/core/build.cjs', '');
  write('pnpm-lock.yaml', `lockfileVersion: '9.0'\nimporters:\n  .: {}\n${members.map(({ ref }) => `  ${ref}: {}`).join('\n')}\n  packages/core: {}\n`);
  const run = (exe, args) => {
    const result = spawnSync(exe, args, { cwd: root, env: environment, encoding: 'utf8', windowsHide: true, timeout: 120000 });
    assert.equal(result.status, 0, `${exe} ${args.join(' ')}\n${result.stdout}\n${result.stderr}\n${result.error ?? ''}`);
    return result.stdout + result.stderr;
  };
  run('git', ['init', '--quiet']);
  run('git', ['add', '--', '.gitignore', 'turbo.json', 'package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'apps', 'recipes', 'packages']);
  const turbo = join(repository, 'node_modules/turbo/bin/turbo');
  const args = [turbo, 'run', 'typecheck', '--concurrency=1', '--output-logs=full', '--cache=local:rw'];
  run(process.execPath, args);
  for (const member of members.slice(0, -1)) rmSync(join(root, member.ref, member.output));
  const second = run(process.execPath, args);
  for (const member of members.slice(0, -1)) {
    assert.equal(readFileSync(join(root, member.ref, member.output), 'utf8'), 'generated', member.name);
    assert.equal(readFileSync(join(markers, encodeURIComponent(member.name) + '.typecheck'), 'utf8'), 'run\nrun\n', member.name);
  }
  assert.equal(readFileSync(join(markers, encodeURIComponent('@fixture/ordinary') + '.typecheck'), 'utf8'), 'run\n');
  assert.match(second, /@fixture\/ordinary:typecheck: cache hit/u);
  const build = [turbo, 'run', 'build', '--concurrency=1', '--output-logs=full', '--cache=local:rw'];
  run(process.execPath, build);
  for (const member of members) rmSync(join(root, member.ref, member.ref.includes('react-router') ? 'build/server/index.js' : 'dist/result.txt'));
  const secondBuild = run(process.execPath, build);
  for (const member of members) {
    const output = member.ref.includes('react-router') ? 'build/server/index.js' : 'dist/result.txt';
    assert.equal(readFileSync(join(root, member.ref, output), 'utf8'), 'generated', member.name);
    const count = readFileSync(join(markers, encodeURIComponent(member.name) + '.build'), 'utf8');
    assert.equal(count, owners.slice(0, 4).includes(member.ref) ? 'run\nrun\n' : 'run\n', member.name);
  }
  assert.match(secondBuild, /react-router-recipe:build: cache hit/u);
  appendFileSync(join(root, 'packages/ordinary/task.cjs'), '\n// changed input\n');
  run(process.execPath, [turbo, 'run', 'typecheck', '--filter=@fixture/ordinary', '--concurrency=1', '--output-logs=full', '--cache=local:rw']);
  assert.equal(readFileSync(join(markers, encodeURIComponent('@fixture/ordinary') + '.typecheck'), 'utf8'), 'run\nrun\n', 'a real source change invalidates the cache');
});
