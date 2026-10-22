import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Window } from "happy-dom";
const require = createRequire(import.meta.url);
const window = new Window();
for (const name of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "Element",
  "Node",
  "MutationObserver",
  "ResizeObserver",
  "localStorage",
  "sessionStorage",
  "Storage",
])
  Object.defineProperty(globalThis, name, {
    value: name === "window" ? window : window[name],
    configurable: true,
  });
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
globalThis.IntersectionObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require("react");
const { createRoot } = require("react-dom/client");
const load = (name) =>
  process.argv[2] === "require" ? require(name) : import(name);
const { Puck } = await load("@cityos-core/puck");
const api = await load("@cityos-core/puck/cityos");
const source = {
  schemaVersion: "cityos.puck.registration.v3",
  dataProfile: "cityos.puck-slots.v0.23.native-screen.v2",
  source: {
    ownerId: "cityos.puck.qualification",
    registryRevision: "standalone-host-v1",
    definitionDigest: "sha256:" + "1".repeat(64),
  },
  components: [
    {
      type: "StandaloneList",
      label: "List",
      renderer: {
        key: "fixture.list",
        version: "1",
        digest: "sha256:" + "a".repeat(64),
      },
      fields: {
        items: {
          type: "string-list",
          label: "List items",
          maxItems: 5,
          maxItemLength: 80,
        },
      },
    },
  ],
};
const config = await api.bindCityOSPuckRegistration(
  source,
  await api.digestCityOSPuckRegistration(source),
  () => ({
    kind: "component",
    enabled: true,
    version: "1",
    digest: "sha256:" + "a".repeat(64),
    render: () => null,
  }),
);
const data = {
  root: { props: {} },
  content: [
    {
      type: "StandaloneList",
      props: { id: "standalone-list", items: ["first", "second"] },
    },
  ],
};
const container = document.createElement("div");
document.body.append(container);
const root = createRoot(container);
const draw = (edit) =>
  React.act(async () => {
    root.render(
      React.createElement(
        Puck,
        {
          config,
          data,
          ui: { itemSelector: { index: 0 } },
          dictionary: { "field-arrayitem-add": "Standalone add" },
          permissions: { edit },
          iframe: { enabled: false },
        },
        React.createElement(Puck.Fields),
      ),
    );
  });
try {
  await draw(true);
  for (
    let attempt = 0;
    attempt < 100 && container.querySelectorAll("textarea").length !== 2;
    attempt++
  )
    await React.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  assert.ok(container.querySelector('[data-cityos-string-list="true"]'));
  assert.deepEqual(
    [...container.querySelectorAll("textarea")].map((field) => field.value),
    ["first", "second"],
  );
  assert.ok(container.querySelector('[aria-label="Standalone add"]'));
  await draw(false);
  assert.equal(container.querySelector('[aria-label="Standalone add"]'), null);
  assert.equal(container.querySelectorAll("textarea").length, 2);
  assert.ok(
    [...container.querySelectorAll("textarea")].every(
      (field) => field.disabled,
    ),
  );
  console.log(
    `Packed ${process.argv[2]} editor fields, context and permission transition passed`,
  );
} finally {
  await React.act(async () => root.unmount());
  await window.happyDOM.close();
}
