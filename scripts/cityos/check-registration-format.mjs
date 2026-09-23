// Format diagnostics use the repository's pinned Prettier, never rewrite source.
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
const require = createRequire(resolve(process.argv[2], 'package.json'));
const prettier = require('prettier');
const paths = [
  'packages/core/cityos-registration.ts',
  'packages/core/cityos.ts',
  'packages/core/__tests__/cityos-registration.test.tsx',
  'packages/core/__tests__/cityos-structured-registration.spec.ts',
  'packages/core/__tests__/cityos-structured-editor.test.tsx',
  'packages/core/__helpers__/cityos-structured-registration.ts',
  'packages/core/__helpers__/cityos-editor-environment.ts',
  'docs/cityos-registration.md',
  'packages/core/cityos-string-list.ts',
  'packages/core/cityos-string-list-field.tsx',
  'packages/core/cityos-string-list-field.module.css',
  'packages/core/lib/dictionary.ts',
  'packages/core/__tests__/cityos-string-list-editor.test.tsx',
  'docs/cityos-string-list-registration.md',
];
for (const path of paths) {
  const source = readFileSync(path, 'utf8');
  const expected = prettier.format(source, { ...(await prettier.resolveConfig(path) ?? {}), filepath: path });
  const output = resolve('.build/cityos-registration/formatted', path);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, expected);
  if (source !== expected) {
    console.error(`Formatting required: ${path}`);
    // Deterministic source-only diff for reviewers without an artifact download.
    // Exit 1 means a difference. Other failures are diagnostics, never a pass.
    const diff = spawnSync('git', ['diff', '--no-index', '--', path, output], {
      encoding: 'utf8', maxBuffer: 2 * 1024 * 1024,
    });
    if (diff.stdout) process.stdout.write(diff.stdout);
    if (diff.error || (diff.status !== 0 && diff.status !== 1)) {
      console.error('Unable to produce format diff', diff.error?.message ?? diff.stderr);
    }
    process.exitCode = 1;
  }
}
