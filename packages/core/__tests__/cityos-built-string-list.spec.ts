/** @jest-environment node */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const coreRoot = resolve(__dirname, "..");

/**
 * Use a separate Node process so both public entries and React resolve as they
 * do for consumers, rather than through Jest's source transforms/module cache.
 * The DOM fixture supports rendering only, not browser layout acceptance.
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
        const React = require('react');
        const { renderToString } = require('react-dom/server');
        const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
        const load = async (entry) => ${JSON.stringify(mode)} === 'require'
          ? require(resolve(entry.require))
          : import(pathToFileURL(resolve(entry.import)).href);
        const { Puck, AutoField } = await load(manifest.exports['.'].default);
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
        const field = config.components.BuiltList.fields.items;
        const render = (canEdit) => renderToString(React.createElement(Puck, {
          config, data, ui: { itemSelector: { index: 0 } },
          dictionary: { 'field-arrayitem-add': 'Active editor add' },
          permissions: { edit: canEdit }, iframe: { enabled: false },
        }, React.createElement(AutoField, { field, id: 'built-field',
          name: 'items', onChange() {} })));
        const html = render(true);
        assert.match(html, /data-cityos-string-list="true"/);
        assert.match(html, /aria-label="Active editor add"/,
          'The field must read the mounted editor dictionary, not another bundle store');
        assert.doesNotMatch(render(false), /aria-label="Active editor add"/,
          'A disabled mounted editor must not expose the list mutation control');
        const styleMatch = html.match(/class="([^"]+)" data-cityos-string-list="true"/);
        assert.ok(styleMatch, 'The built field must retain its class');
        const css = readFileSync(resolve(manifest.exports['./puck.css']), 'utf8');
        for (const name of styleMatch[1].split(/\\s+/)) {
          assert.ok(css.includes('.' + name), 'Public puck.css omits the built field style: ' + name);
        }
        await window.happyDOM.close();
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
