/** @jest-environment node */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const coreRoot = resolve(__dirname, "..");

/**
 * Separate consumers resolve actual prepared public entries and React, without
 * Jest source transforms. Mount the client and flush its effects: server-only
 * rendering does not initialize Puck's existing permission-registration effect.
 * Happy DOM does not establish browser geometry, accessibility or Next.js proof.
 */
describe("CityOS built scalar-list consumer boundary", () => {
  for (const mode of ["require", "import"]) {
    it(`shares editor context and ships field styles through ${mode} exports`, () => {
      const script = `
        import assert from 'node:assert/strict';
        import { createRequire } from 'node:module';
        import { readFileSync } from 'node:fs';
        import { resolve } from 'node:path';
        import { pathToFileURL } from 'node:url';
        import { Window } from 'happy-dom';
        const require = createRequire(resolve('package.json'));
        const window = new Window();
        for (const name of ['window', 'document', 'navigator', 'HTMLElement',
          'Element', 'Node', 'MutationObserver', 'ResizeObserver']) {
          Object.defineProperty(globalThis, name, {
            value: name === 'window' ? window : window[name], configurable: true,
          });
        }
        globalThis.getComputedStyle = window.getComputedStyle.bind(window);
        globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
        globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
        globalThis.IntersectionObserver = class {
          observe() {} unobserve() {} disconnect() {} takeRecords() { return []; }
        };
        globalThis.IS_REACT_ACT_ENVIRONMENT = true;
        const React = require('react');
        const { createRoot } = require('react-dom/client');
        const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
        const load = async (entry) => ${JSON.stringify(mode)} === 'require'
          ? require(resolve(entry.require))
          : import(pathToFileURL(resolve(entry.import)).href);
        const { Puck } = await load(manifest.exports['.'].default);
        const api = await load(manifest.exports['./cityos']);
        const source = {
          schemaVersion: 'cityos.puck.registration.v3',
          dataProfile: 'cityos.puck-slots.v0.23.native-screen.v2',
          source: { ownerId: 'core.cms', registryRevision: 'built-fixture',
            definitionDigest: 'sha256:' + '1'.repeat(64) },
          components: [{ type: 'BuiltList', label: 'List',
            renderer: { key: 'fixture.list', version: '1', digest: 'sha256:' + 'a'.repeat(64) },
            fields: { items: { type: 'string-list', label: 'List items', maxItems: 5, maxItemLength: 80 } },
          }],
        };
        const config = await api.bindCityOSPuckRegistration(source,
          await api.digestCityOSPuckRegistration(source),
          () => ({ kind: 'component', enabled: true, version: '1',
            digest: 'sha256:' + 'a'.repeat(64), render: () => null }));
        const data = { root: { props: {} }, content: [{ type: 'BuiltList',
          props: { id: 'built-list', items: ['first', 'second'] } }] };
        const container = document.createElement('div');
        document.body.append(container);
        const root = createRoot(container);
        const draw = async (canEdit) => {
          await React.act(async () => {
            root.render(React.createElement(Puck, {
              config, data, ui: { itemSelector: { index: 0 } },
              dictionary: { 'field-arrayitem-add': 'Active editor add' },
              permissions: { edit: canEdit }, iframe: { enabled: false },
            }, React.createElement(Puck.Fields)));
          });
        };
        try {
          await draw(true);
          for (let attempt = 0; attempt < 100 && container.querySelectorAll('textarea').length !== 2; attempt++) {
            await React.act(async () => { await new Promise(r => setTimeout(r, 10)); });
          }
          assert.ok(container.querySelector('[data-cityos-string-list="true"]'));
          assert.deepEqual([...container.querySelectorAll('textarea')].map(i => i.value), ['first', 'second']);
          assert.ok(container.querySelector('[aria-label="Active editor add"]'),
            'The field must read the mounted editor dictionary, not another bundle store');
          await draw(false);
          assert.equal(container.querySelector('[aria-label="Active editor add"]'), null,
            'A disabled mounted editor must not expose the list mutation control');
          assert.ok([...container.querySelectorAll('textarea')].every(i => i.readOnly));
          const field = container.querySelector('[data-cityos-string-list="true"]');
          const css = readFileSync(resolve(manifest.exports['./puck.css']), 'utf8');
          for (const name of field.classList) {
            assert.ok(css.includes('.' + name), 'Public puck.css omits the built field style: ' + name);
          }
        } finally {
          await React.act(async () => { root.unmount(); });
          await window.happyDOM.close();
        }
        console.log('BUILT_SCALAR_LIST_OK');
      `;
      const output = execFileSync(
        process.execPath,
        ["--input-type=module", "-e", script],
        { cwd: coreRoot, encoding: "utf8", timeout: 20_000 }
      );
      expect(output).toContain("BUILT_SCALAR_LIST_OK");
    }, 30_000);
  }
});
