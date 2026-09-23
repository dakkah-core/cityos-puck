/** @jest-environment jsdom */
import "../__helpers__/cityos-editor-environment";
import React from "react";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TextEncoder } from "node:util";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Puck } from "../components/Puck";
import { Render } from "../components/Render";
import type { Data } from "../types";
import type { Dictionary } from "../lib/dictionary";
import {
  bindCityOSPuckRegistration,
  digestCityOSPuckRegistration,
  type CityOSPuckInstalledRenderer,
} from "../cityos";

beforeAll(() => {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
  Object.defineProperty(globalThis, "TextEncoder", {
    value: TextEncoder,
    configurable: true,
  });
});
afterEach(cleanup);

const initialValues = ["", "same", "same", "  spaced  ", "first\nsecond"];
async function fixture({
  readOnly = false,
  value = initialValues,
  dictionary = {},
  type = "FutureScalarList",
  maximum = 6,
}: {
  readOnly?: boolean;
  value?: unknown;
  dictionary?: Dictionary;
  type?: string;
  maximum?: number;
} = {}) {
  const source = {
    schemaVersion: "cityos.puck.registration.v3",
    dataProfile: "cityos.puck-slots.v0.23.native-screen.v2",
    source: {
      ownerId: "core.cms",
      registryRevision: "independent-fixture",
      definitionDigest: "sha256:" + "1".repeat(64),
    },
    components: [
      {
        type,
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
            maxItems: maximum,
            maxItemLength: 80,
          },
        },
      },
    ],
  };
  const installed: CityOSPuckInstalledRenderer = {
    kind: "component",
    enabled: true,
    version: "1",
    digest: "sha256:" + "a".repeat(64),
    render: (props) => (
      <pre data-testid="scalar-render">{JSON.stringify(props.items)}</pre>
    ),
  };
  const config = await bindCityOSPuckRegistration(
    source,
    await digestCityOSPuckRegistration(source),
    () => installed
  );
  const data: Data = {
    root: { props: { id: "root" } },
    content: [
      {
        type,
        props: {
          id: "stable-list",
          items: value,
          sibling: "preserved",
        },
      },
    ],
  };
  const change = jest.fn<void, [Data]>();
  await act(async () => {
    render(
      <Puck
        config={config}
        data={data}
        onChange={change}
        dictionary={dictionary}
        ui={{ itemSelector: { index: 0 } }}
        permissions={{ edit: !readOnly }}
        iframe={{ enabled: false }}
      >
        <Puck.Fields />
      </Puck>
    );
  });
  // The existing Jest CSS mock does not load the real visibility rule.
  // Model that rule only; do not modify application permission or validation.
  const css = readFileSync(
    join(__dirname, "../components/Puck/components/Layout/styles.module.css"),
    "utf8"
  );
  expect(css).toMatch(/\.Puck\s*\{[^}]*visibility:\s*visible\s*!important/);
  const editor = document.querySelector<HTMLElement>(".Puck");
  if (!editor) throw new Error("Puck editor fixture did not mount");
  editor.style.visibility = "visible";
  const latest = () => change.mock.calls[change.mock.calls.length - 1]?.[0];
  return { config, data, change, latest };
}

describe("compiler-admitted scalar lists in real Puck field controls", () => {
  it("preserves empty strings, duplicates, whitespace and embedded newlines on load", async () => {
    const f = await fixture();
    const inputs = await screen.findAllByRole("textbox");
    expect(inputs.map((input) => (input as HTMLTextAreaElement).value)).toEqual(
      initialValues
    );
    expect(f.change).not.toHaveBeenCalled();
    expect(f.data.content[0].props.items).toEqual(initialValues);
    expect(f.config.components.FutureScalarList.fields?.items.type).toBe(
      "custom"
    );
  });

  it("edits one scalar without changing node identity or sibling fields", async () => {
    const f = await fixture();
    const input = await screen.findByRole("textbox", {
      name: "List items: Item #2",
    });
    fireEvent.change(input, { target: { value: "نص\nجديد" } });
    await waitFor(() => {
      expect(f.latest()?.content[0].props.items).toEqual([
        "",
        "نص\nجديد",
        "same",
        "  spaced  ",
        "first\nsecond",
      ]);
    });
    expect(f.latest()?.content[0].props.id).toBe("stable-list");
    expect(f.latest()?.content[0].props.sibling).toBe("preserved");
    expect(initialValues[1]).toBe("same");
  });

  it("adds only on explicit action and respects the declared capacity", async () => {
    const f = await fixture({ value: ["existing"], maximum: 2 });
    fireEvent.click(await screen.findByRole("button", { name: "Add item" }));
    await waitFor(() => {
      expect(f.latest()?.content[0].props.items).toEqual(["existing", ""]);
    });
    expect(screen.queryByRole("button", { name: "Add item" })).toBeNull();
  });

  it("supports keyboard-invocable reorder and removal with focus recovery", async () => {
    const f = await fixture({ value: ["first", "second"] });
    fireEvent.click(
      await screen.findByRole("button", { name: "Move down: Item #1" })
    );
    await waitFor(() => {
      expect(f.latest()?.content[0].props.items).toEqual(["second", "first"]);
    });
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "List items: Item #2" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete: Item #2" }));
    await waitFor(() => {
      expect(f.latest()?.content[0].props.items).toEqual(["second"]);
    });
  });

  it("denies programmatic field changes as well as hiding read-only controls", async () => {
    const f = await fixture({ readOnly: true, value: ["protected"] });
    const input = await screen.findByRole("textbox", {
      name: "List items: Item #1",
    });
    expect((input as HTMLTextAreaElement).readOnly).toBe(true);
    expect(screen.queryByRole("button", { name: "Add item" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Delete:/ })).toBeNull();
    fireEvent.change(input, { target: { value: "forged" } });
    expect(f.change).not.toHaveBeenCalled();
  });

  it("uses the existing dictionary for Arabic list controls", async () => {
    const f = await fixture({
      value: ["أول", "ثان"],
      dictionary: {
        "field-arrayitem-summary": "العنصر {index}",
        "field-arrayitem-add": "إضافة عنصر",
        "field-arrayitem-delete": "حذف",
        "field-stringlist-moveup": "نقل لأعلى",
        "field-stringlist-movedown": "نقل لأسفل",
      },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "نقل لأسفل: العنصر 1" })
    );
    await waitFor(() => {
      expect(f.latest()?.content[0].props.items).toEqual(["ثان", "أول"]);
    });
    expect(screen.getByRole("button", { name: "إضافة عنصر" })).toBeTruthy();
  });

  it("preserves malformed retained data instead of silently converting it", async () => {
    const retained = { value: "not-an-array" };
    const f = await fixture({ value: retained });
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Add item" })).toBeNull();
    expect(f.change).not.toHaveBeenCalled();
    expect(f.data.content[0].props.items).toEqual(retained);
  });

  it("does not coerce scalar lists on the actual Render path", async () => {
    const f = await fixture();
    cleanup();
    render(<Render config={f.config} data={f.data} />);
    expect(screen.getByTestId("scalar-render").textContent).toBe(
      JSON.stringify(initialValues)
    );
  });
});
