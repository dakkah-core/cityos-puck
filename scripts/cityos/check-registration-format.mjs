// Format diagnostics use the repository's pinned Prettier, never rewrite source.
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
const require = createRequire(resolve(process.argv[2], 'package.json'));
const prettier = require('prettier');
const paths = ['packages/core/cityos-registration.ts', 'packages/core/cityos.ts', 'packages/core/__tests__/cityos-registration.test.tsx', 'docs/cityos-registration.md'];
for (const path of paths) {
  const source = readFileSync(path, 'utf8');
  const expected = prettier.format(source, { ...(await prettier.resolveConfig(path) ?? {}), filepath: path });
  const output = resolve('.build/cityos-registration/formatted', path);
  mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, expected);
  if (source !== expected) { console.error(`Formatting required: ${path}`); process.exitCode = 1; }
}
