import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { copyRecipes } from './copy-recipes.mjs';

test('copies authored recipe files as bytes while excluding transient and local files', () => {
  const root = mkdtempSync(join(tmpdir(), 'puck-copy-recipes-test-'));
  try {
    const recipes = join(root, 'recipes'), templates = join(root, 'templates');
    const write = (path, bytes) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes); };
    write(join(recipes, 'next/package.json'), JSON.stringify({ dependencies: { next: '1' } }));
    write(join(recipes, 'next/.gitignore'), '/.next/\n');
    write(join(recipes, 'next/.env.example'), 'EXAMPLE=\n');
    write(join(recipes, 'next/.env.local'), 'local value');
    write(join(recipes, 'next/.next/types/routes.d.ts'), 'generated');
    write(join(recipes, 'next/next-env.d.ts'), 'generated');
    write(join(recipes, 'next/node_modules/example/index.js'), 'dependency');
    const binary = Buffer.from([0, 255, 128, 1, 10]);
    write(join(recipes, 'next/public/icon.ico'), binary);
    write(join(recipes, 'router/package.json'), JSON.stringify({ dependencies: { 'react-router': '1' } }));
    write(join(recipes, 'router/.react-router/types/route.ts'), 'generated');
    write(join(recipes, 'router/src/env.d.ts'), 'authored');
    write(join(templates, 'next/package.json.hbs'), 'existing template');
    copyRecipes({ recipePath: recipes, templatePath: templates });
    assert.deepEqual(readFileSync(join(templates, 'next/public/icon.ico')), binary);
    assert.equal(readFileSync(join(templates, 'next/.gitignore'), 'utf8'), '/.next/\n');
    assert.equal(readFileSync(join(templates, 'next/gitignore'), 'utf8'), '/.next/\n');
    assert.equal(readFileSync(join(templates, 'next/.env.example'), 'utf8'), 'EXAMPLE=\n');
    assert.equal(readFileSync(join(templates, 'router/src/env.d.ts'), 'utf8'), 'authored');
    for (const path of ['next/.env.local', 'next/.next/types/routes.d.ts', 'next/next-env.d.ts', 'next/node_modules/example/index.js', 'router/.react-router/types/route.ts', 'next/package.json']) assert.equal(existsSync(join(templates, path)), false, path);
    write(join(templates, 'next/.next/types/stale.d.ts'), 'stale');
    assert.throws(() => copyRecipes({ recipePath: recipes, templatePath: templates }), /transient.*template/i);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('refuses to package a local environment file left in an existing template', () => {
  const root = mkdtempSync(join(tmpdir(), 'puck-stale-env-test-'));
  try {
    const recipes = join(root, 'recipes'), templates = join(root, 'templates');
    const write = (path, value) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, value); };
    write(join(recipes, 'next/package.json'), JSON.stringify({ dependencies: { next: '1' } }));
    write(join(recipes, 'next/new-source.ts'), 'authored');
    write(join(recipes, 'next/.env.example'), 'EXAMPLE=\n');
    write(join(templates, 'next/.env.example'), 'EXAMPLE=\n');
    write(join(templates, 'next/config/.env.local'), 'local value');
    assert.throws(() => copyRecipes({ recipePath: recipes, templatePath: templates }), /Local environment file already exists in template/);
    assert.equal(existsSync(join(templates, 'next/new-source.ts')), false);
    assert.equal(readFileSync(join(templates, 'next/config/.env.local'), 'utf8'), 'local value');
    rmSync(join(templates, 'next/config/.env.local'));
    copyRecipes({ recipePath: recipes, templatePath: templates });
    assert.equal(readFileSync(join(templates, 'next/new-source.ts'), 'utf8'), 'authored');
    assert.equal(readFileSync(join(templates, 'next/.env.example'), 'utf8'), 'EXAMPLE=\n');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('fails closed when a previously copied recipe file is removed, preserving authored files', () => {
  const root = mkdtempSync(join(tmpdir(), 'puck-stale-recipe-test-'));
  try {
    const recipes = join(root, 'recipes'), templates = join(root, 'templates');
    const write = (path, value) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, value); };
    write(join(recipes, 'next/package.json'), JSON.stringify({ dependencies: { next: '1' } }));
    write(join(recipes, 'next/old.ts'), 'old source');
    write(join(templates, 'next/package.json.hbs'), 'authored template');
    write(join(templates, 'next/.nvmrc.hbs'), 'authored standalone template');
    copyRecipes({ recipePath: recipes, templatePath: templates });
    rmSync(join(recipes, 'next/old.ts'));
    write(join(recipes, 'next/new.ts'), 'new source');
    assert.throws(() => copyRecipes({ recipePath: recipes, templatePath: templates }), /unmanaged|stale/i);
    assert.equal(readFileSync(join(templates, 'next/old.ts'), 'utf8'), 'old source');
    assert.equal(readFileSync(join(templates, 'next/.nvmrc.hbs'), 'utf8'), 'authored standalone template');
    assert.equal(existsSync(join(templates, 'next/new.ts')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('fails closed on a removed recipe without deleting its template or unrelated content', () => {
  const root = mkdtempSync(join(tmpdir(), 'puck-removed-recipe-test-'));
  try {
    const recipes = join(root, 'recipes'), templates = join(root, 'templates');
    const write = (path, value) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, value); };
    write(join(recipes, 'next/package.json'), JSON.stringify({ dependencies: { next: '1' } }));
    write(join(recipes, 'next/page.ts'), 'old page');
    write(join(templates, 'next/package.json.hbs'), 'authored template');
    copyRecipes({ recipePath: recipes, templatePath: templates });
    rmSync(join(recipes, 'next'), { recursive: true });
    assert.throws(() => copyRecipes({ recipePath: recipes, templatePath: templates }), /unmanaged|stale|removed/i);
    assert.equal(readFileSync(join(templates, 'next/page.ts'), 'utf8'), 'old page');
    assert.equal(readFileSync(join(templates, 'next/package.json.hbs'), 'utf8'), 'authored template');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('rejects an HBS-only removed recipe without deleting its authored template', () => {
  const root = mkdtempSync(join(tmpdir(), 'puck-removed-hbs-test-'));
  try {
    const recipes = join(root, 'recipes'), templates = join(root, 'templates');
    const write = (path, value) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, value); };
    write(join(recipes, 'next/package.json'), JSON.stringify({ dependencies: { next: '1' } }));
    write(join(templates, 'next/package.json.hbs'), 'authored template');
    copyRecipes({ recipePath: recipes, templatePath: templates });
    rmSync(join(recipes, 'next'), { recursive: true });
    assert.throws(() => copyRecipes({ recipePath: recipes, templatePath: templates }), /unmanaged|stale/i);
    assert.equal(readFileSync(join(templates, 'next/package.json.hbs'), 'utf8'), 'authored template');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('rejects stale HBS in an active recipe before copying and preserves authored templates', () => {
  const root = mkdtempSync(join(tmpdir(), 'puck-stale-hbs-test-'));
  try {
    const recipes = join(root, 'recipes'), templates = join(root, 'templates');
    const write = (path, value) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, value); };
    write(join(recipes, 'next/package.json'), JSON.stringify({ dependencies: { next: '1' } }));
    write(join(recipes, 'next/new.ts'), 'new source');
    write(join(templates, 'next/package.json.hbs'), 'authored template');
    write(join(templates, 'next/.nvmrc.hbs'), 'authored standalone template');
    write(join(templates, 'next/stale.hbs'), 'preserve for review');
    assert.throws(() => copyRecipes({ recipePath: recipes, templatePath: templates }), /unmanaged|stale/i);
    assert.equal(readFileSync(join(templates, 'next/stale.hbs'), 'utf8'), 'preserve for review');
    assert.equal(readFileSync(join(templates, 'next/package.json.hbs'), 'utf8'), 'authored template');
    assert.equal(readFileSync(join(templates, 'next/.nvmrc.hbs'), 'utf8'), 'authored standalone template');
    assert.equal(existsSync(join(templates, 'next/new.ts')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('rejects unknown adapter files while preserving unrelated content', () => {
  const root = mkdtempSync(join(tmpdir(), 'puck-unmanaged-template-test-'));
  try {
    const recipes = join(root, 'recipes'), templates = join(root, 'templates');
    const write = (path, value) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, value); };
    write(join(recipes, 'next/package.json'), JSON.stringify({ dependencies: { next: '1' } }));
    write(join(templates, 'next/.cityos/next-typecheck/unrelated.js'), 'keep');
    assert.throws(() => copyRecipes({ recipePath: recipes, templatePath: templates }), /unmanaged|stale/i);
    assert.equal(readFileSync(join(templates, 'next/.cityos/next-typecheck/unrelated.js'), 'utf8'), 'keep');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('rejects collisions between an authored gitignore and the .gitignore alias before copying', () => {
  const root = mkdtempSync(join(tmpdir(), 'puck-gitignore-collision-'));
  try {
    const recipes = join(root, 'recipes'), templates = join(root, 'templates');
    const write = (path, value) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, value); };
    write(join(recipes, 'next/package.json'), JSON.stringify({ dependencies: { next: '1' } }));
    write(join(recipes, 'next/.gitignore'), 'first');
    write(join(recipes, 'next/gitignore'), 'second');
    write(join(templates, 'next/.nvmrc.hbs'), 'preserve');
    assert.throws(() => copyRecipes({ recipePath: recipes, templatePath: templates }), /copy target collision/i);
    assert.equal(readFileSync(join(templates, 'next/.nvmrc.hbs'), 'utf8'), 'preserve');
    assert.equal(existsSync(join(templates, 'next/gitignore')), false);
    assert.equal(existsSync(join(templates, 'next/.gitignore')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('accepts the root ignore file renamed by the publish lifecycle', () => {
  const root = mkdtempSync(join(tmpdir(), 'puck-publish-ignore-'));
  try {
    const recipes = join(root, 'recipes'), templates = join(root, 'templates');
    const write = (path, value) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, value); };
    write(join(recipes, 'next/package.json'), JSON.stringify({ dependencies: { next: '1' } }));
    write(join(recipes, 'next/page.ts'), 'authored');
    write(join(templates, 'gitignore'), 'publish lifecycle');
    copyRecipes({ recipePath: recipes, templatePath: templates });
    assert.equal(readFileSync(join(templates, 'gitignore'), 'utf8'), 'publish lifecycle');
    assert.equal(readFileSync(join(templates, 'next/page.ts'), 'utf8'), 'authored');
    write(join(templates, '.gitignore'), 'original');
    assert.throws(() => copyRecipes({ recipePath: recipes, templatePath: templates }), /unmanaged|stale/i);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
