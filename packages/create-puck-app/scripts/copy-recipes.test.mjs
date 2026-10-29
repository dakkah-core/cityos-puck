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
