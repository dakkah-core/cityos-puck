import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { readTemplateFile, templateTargetPath } from './template-file.mjs';

test('app creation renders templates and preserves binary assets byte-for-byte', () => {
  const root = mkdtempSync(join(tmpdir(), 'puck-template-file-'));
  try {
    const asset = join(root, 'icon.ico'), template = join(root, 'text.hbs');
    const bytes = Buffer.from([0, 128, 255, 10]);
    writeFileSync(asset, bytes); writeFileSync(template, 'Hello {{name}}');
    assert.deepEqual(readTemplateFile(asset, () => { throw Error('binary was rendered'); }), bytes);
    assert.equal(readTemplateFile(template, text => text.replace('{{name}}', 'CityOS')), 'Hello CityOS');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the creator publishes its byte-preserving template reader', () => {
  const manifest = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
  assert.ok(manifest.files.includes('template-file.mjs'));
});

test('template target renaming affects only the intended filename', () => {
  const app = join('parent-gitignore.hbs', 'gitignore-app');
  assert.equal(templateTargetPath(app, 'gitignore'), join(app, '.gitignore'));
  assert.equal(templateTargetPath(app, '.gitignore'), join(app, '.gitignore'));
  assert.equal(templateTargetPath(app, join('gitignore-assets.hbs', 'file.hbs')), join(app, 'gitignore-assets.hbs', 'file'));
  assert.equal(templateTargetPath(app, 'gitignore-notes.txt'), join(app, 'gitignore-notes.txt'));
});
