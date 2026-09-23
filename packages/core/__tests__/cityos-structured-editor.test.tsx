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
import {
  bindCityOSPuckRegistration,
  digestCityOSPuckRegistration,
  type CityOSPuckInstalledRenderer,
} from "../cityos-registration";
import {
  fixtureDigest,
  structuredRegistration,
} from "../__helpers__/cityos-structured-registration";

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

async function fixture(readOnly = false, type = "GeneratedProfile") {
  const source = structuredRegistration(undefined, type);
  const installed: CityOSPuckInstalledRenderer = {
    kind: "component",
    enabled: true,
    version: "1",
    digest: fixtureDigest,
    render: (props) => <p>{String(props.profile?.name ?? "")}</p>,
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
          id: "stable-component",
          profile: { name: "Before", id: "domain-id" },
          rows: [{ value: "Existing text" }],
          enabled: true,
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
        ui={{ itemSelector: { index: 0 } }}
        permissions={{ edit: !readOnly }}
        iframe={{ enabled: false }}
      >
        <Puck.Fields />
      </Puck>
    );
  });
  // Jest mocks CSS modules. In the real host, this exact stylesheet rule
  // reveals the shell after styles load. Model only that missing CSS effect;
  // do not change production visibility, permission checks or field behavior.
  const css = readFileSync(
    join(__dirname, "../components/Puck/components/Layout/styles.module.css"),
    "utf8"
  );
  expect(css).toMatch(/\.Puck\s*\{[^}]*visibility:\s*visible\s*!important/);
  const editor = document.querySelector<HTMLElement>(".Puck");
  if (!editor) throw new Error("Puck editor fixture did not mount");
  editor.style.visibility = "visible";
  return { config, data, change };
}

/** Real controls, queried by their accessible labels; not browser/CSS proof. */
describe("generated structured fields in the actual editor", () => {
  it("edits a nested property without replacing other values or node IDs", async () => {
    const f = await fixture();
    const input = await screen.findByRole("textbox", { name: "Display name" });
    fireEvent.change(input, { target: { value: "نص جديد" } });
    await waitFor(() => {
      const calls = f.change.mock.calls;
      expect(calls[calls.length - 1]?.[0].content[0].props.profile).toEqual({
        name: "نص جديد",
        id: "domain-id",
      });
    });
    const latest = f.change.mock.calls[f.change.mock.calls.length - 1][0];
    expect(latest.content[0].props.id).toBe("stable-component");
    expect(latest.content[0].props.rows).toEqual([{ value: "Existing text" }]);
    expect(f.data.content[0].props.profile.name).toBe("Before");
  });

  it("uses the registered array bound in the native add-item control", async () => {
    const f = await fixture();
    const add = await screen.findByRole("button", { name: /add/i });
    fireEvent.click(add);
    await waitFor(() => {
      const calls = f.change.mock.calls;
      expect(calls[calls.length - 1]?.[0].content[0].props.rows).toHaveLength(
        2
      );
    });
    expect(screen.queryByRole("button", { name: /add/i })).toBeNull();
    const latest = f.change.mock.calls[f.change.mock.calls.length - 1][0];
    expect(latest.content[0].props.rows[0]).toEqual({ value: "Existing text" });
    expect(latest.content[0].props.profile.id).toBe("domain-id");
  });

  it("renders a boolean radio field without stringifying the emitted value", async () => {
    const f = await fixture();
    fireEvent.click(await screen.findByRole("radio", { name: "No" }));
    await waitFor(() => {
      const calls = f.change.mock.calls;
      expect(calls[calls.length - 1]?.[0].content[0].props.enabled).toBe(false);
    });
  });

  it("honors the host read-only state on nested controls", async () => {
    await fixture(true);
    const input = (await screen.findByRole("textbox", {
      name: "Display name",
    })) as HTMLInputElement;
    expect(input.disabled || input.readOnly).toBe(true);
    expect(screen.queryByRole("button", { name: /add/i })).toBeNull();
  });

  it("uses the same field editor for a newly named registered component", async () => {
    const f = await fixture(false, "FutureConfigOnlyProfile");
    fireEvent.change(
      await screen.findByRole("textbox", { name: "Business ID" }),
      {
        target: { value: "domain-next" },
      }
    );
    await waitFor(() => {
      const calls = f.change.mock.calls;
      expect(calls[calls.length - 1]?.[0].content[0].type).toBe(
        "FutureConfigOnlyProfile"
      );
      expect(calls[calls.length - 1]?.[0].content[0].props.profile.id).toBe(
        "domain-next"
      );
    });
  });

  it("renders authored strings as text through the registered runtime", async () => {
    const f = await fixture();
    cleanup();
    const text = '<img src=x onerror="window.untrusted=true">';
    const data = {
      ...f.data,
      content: [
        {
          ...f.data.content[0],
          props: { ...f.data.content[0].props, profile: { name: text } },
        },
      ],
    };
    const result = render(<Render config={f.config} data={data} />);
    expect(result.container.textContent).toContain(text);
    expect(result.container.querySelector("img")).toBeNull();
  });
});
