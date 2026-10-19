// Requires the parent's admitted install and a freshly built owned core bundle.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const contract = JSON.parse(readFileSync(new URL("../../config/dependencies/plugin-ai.json", import.meta.url), "utf8"));

for (const recipe of ["next-ai", "react-router-ai"]) {
  test(`${recipe}: patched plugin shares the owned editor context and preserves dynamic config behavior`, () => {
    const script = `
      import assert from 'node:assert/strict';
      import { readFileSync } from 'node:fs';
      import { createHash } from 'node:crypto';
      import { createRequire } from 'node:module';
      import { resolve } from 'node:path';
      import { pathToFileURL } from 'node:url';
      const require = createRequire(resolve('package.json'));
      const coreRequire = createRequire(resolve('../../packages/core/package.json'));
      const { Window } = await import(pathToFileURL(coreRequire.resolve('happy-dom')).href);
      const window = new Window();
      for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'MutationObserver', 'ResizeObserver']) {
        Object.defineProperty(globalThis, name, { value: name === 'window' ? window : window[name], configurable: true });
      }
      globalThis.getComputedStyle = window.getComputedStyle.bind(window);
      globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
      globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
      globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
      globalThis.IS_REACT_ACT_ENVIRONMENT = true;
      const React = require('react');
      const { createRoot } = require('react-dom/client');
      const owned = await import('@cityos-core/puck');
      const alias = await import('@puckeditor/core');
      assert.equal(owned.createUsePuck, alias.createUsePuck);
      assert.equal(owned.Puck, alias.Puck);
      const expected = ${JSON.stringify(contract)};
      const pluginRoot = resolve('node_modules/@puckeditor/plugin-ai');
      const manifest = JSON.parse(readFileSync(resolve(pluginRoot, 'package.json'), 'utf8'));
      assert.equal(manifest.peerDependencies[expected.corePackage], expected.coreSourceVersion);
      assert.equal(manifest.peerDependencies['@puckeditor/core'], undefined);
      for (const file of ['dist/index.mjs', 'dist/index.js', 'dist/index.d.ts', 'dist/index.d.mts']) {
        const bytes = readFileSync(resolve(pluginRoot, file));
        assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.files[file].adaptedSha256, file);
      }
      const { createAiPlugin, withDynamicConfig } = await import('@puckeditor/plugin-ai');
      const base = { components: { Fixture: { fields: {}, render: () => React.createElement('p', null, 'Fixture') } } };
      const data = { root: { props: { _dynamicConfig: { components: { Designed: { label: 'Designed fixture', html: '<p>Designed</p>', styles: '', script: '', defaultProps: { title: 'Preserved' } } } } } }, content: [] };
      const result = withDynamicConfig(base, data);
      assert.equal(result.components.Fixture, base.components.Fixture);
      assert.equal(result.components.Designed.label, 'Designed fixture');
      assert.equal(result.components.Designed.defaultProps.title, 'Preserved');
      assert.equal(base.components.Designed, undefined);
      assert.equal(result.root.fields._dynamicConfig.type, 'custom');
      const plugin = createAiPlugin({ scrollTracking: false, designMode: false });
      const container = document.createElement('div');
      document.body.append(container);
      const root = createRoot(container);
      const draw = async (config) => {
        await React.act(async () => root.render(React.createElement(owned.Puck, {
          config, data: { root: { props: {} }, content: [] }, iframe: { enabled: false },
        }, React.createElement(plugin.overrides.drawer, null, React.createElement('span', { 'data-context-fixture': true }, 'Owned context')))));
      };
      try {
        await draw(base);
        assert.ok(container.querySelector('[data-context-fixture]'), 'The patched plugin must read the mounted owned core config');
        await draw({ components: {} });
        assert.match(container.textContent, /No blocks/);
        assert.equal(container.querySelector('[data-context-fixture]'), null);
      } finally {
        await React.act(async () => root.unmount());
        await window.happyDOM.close();
      }
      console.log('CITYOS_PLUGIN_AI_CONTEXT_OK');
    `;
    const output = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: fileURLToPath(new URL(`../../recipes/${recipe}/`, import.meta.url)), encoding: "utf8", timeout: 30_000,
    });
    assert.match(output, /CITYOS_PLUGIN_AI_CONTEXT_OK/u);
  });
}
