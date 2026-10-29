import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { GENERATED_TYPES_POLICY_FILES } from '../../../scripts/toolchains/verify-generated-types-policy.mjs';

// Copy the verified projection and its Puck adapter as package inputs; the
// compiler-owned policy remains generated only by its canonical projector.
export function copyNextToolchain({ repositoryRoot, templatePath }) {
  const source = join(repositoryRoot, 'scripts/toolchains');
  for (const recipe of ['next', 'next-ai']) {
    const target = join(templatePath, recipe, '.cityos/next-typecheck');
    mkdirSync(join(target, 'generated-types-policy'), { recursive: true });
    for (const file of ['next-generated-types.mjs', 'next-build-guard.mjs', 'next-output-lock.mjs', 'next-typecheck-overlay.mjs', 'verify-generated-types-policy.mjs']) copyFileSync(join(source, file), join(target, file));
    for (const file of [...GENERATED_TYPES_POLICY_FILES, 'projection.json']) copyFileSync(join(source, 'generated-types-policy', file), join(target, 'generated-types-policy', file));
    copyFileSync(join(repositoryRoot, 'config/toolchains/node-typescript.json'), join(target, 'node-typescript.json'));
  }
}
