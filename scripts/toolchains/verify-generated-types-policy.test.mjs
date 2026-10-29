import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyGeneratedTypesPolicy } from './verify-generated-types-policy.mjs';

test('verifies the projection independently and rejects a modified output', () => {
  verifyGeneratedTypesPolicy();
  const root = mkdtempSync(join(tmpdir(), 'puck-projection-test-'));
  try {
    cpSync(join(dirname(fileURLToPath(import.meta.url)), 'generated-types-policy'), root, { recursive: true });
    writeFileSync(join(root, 'generated-types-policy.mjs'), 'modified');
    assert.throws(() => verifyGeneratedTypesPolicy(root), /stale/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
