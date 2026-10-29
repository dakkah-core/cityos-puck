import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultDirectory = join(dirname(fileURLToPath(import.meta.url)), 'generated-types-policy');
export const GENERATED_TYPES_POLICY_FILES = Object.freeze([
  'generated-types-policy.mjs', 'generated-types-policy.d.mts', 'generated-types-policy.test.mjs',
  'generated-type-check-evidence.mjs', 'generated-type-check-evidence.d.mts', 'generated-type-check-evidence.test.mjs',
  'resolution-namespace-v2.mjs', 'resolution-namespace-v2.d.mts', 'resolution-namespace-v2.test.mjs',
]);
export function verifyGeneratedTypesPolicy(directory = defaultDirectory) {
  const manifest = JSON.parse(readFileSync(join(directory, 'projection.json'), 'utf8'));
  if (manifest.schemaVersion !== 'cityos.generated-types-policy-projection.v2' || !Array.isArray(manifest.files) || manifest.files.length !== GENERATED_TYPES_POLICY_FILES.length) throw new Error('Invalid generated type policy projection manifest');
  for (const [index, name] of GENERATED_TYPES_POLICY_FILES.entries()) {
    const entry = manifest.files[index];
    const digest = createHash('sha256').update(readFileSync(join(directory, name))).digest('hex');
    if (entry?.path !== name || entry.sourceSha256 !== digest || entry.outputSha256 !== digest) throw new Error(`Generated type policy projection is stale: ${name}`);
  }
}
