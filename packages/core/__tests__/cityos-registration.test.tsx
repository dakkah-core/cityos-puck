/** @jest-environment node */
import React from "react";
import { webcrypto } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { Render } from "../components/Render";
import {
  bindCityOSPuckRegistration,
  digestCityOSPuckRegistration,
  type CityOSPuckInstalledRenderer,
} from "../cityos-registration";

beforeAll(() => {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
});

const rendererDigest = "sha256:" + "a".repeat(64);
const metadata = (type: string) => ({
  schemaVersion: "cityos.puck.registration.v1",
  dataProfile: "cityos.puck-slots.v0.23.native-screen.v2",
  source: { ownerId: "core.cms", registryRevision: "fixture-v1", definitionDigest: rendererDigest },
  components: [{
    type,
    label: "Generated paragraph",
    renderer: { key: "fixture.paragraph", version: "1", digest: rendererDigest },
    fields: { text: { type: "text", label: "Text" } },
  }],
});

it("renders newly named config-only components through the real Puck renderer", async () => {
  const installed: CityOSPuckInstalledRenderer = {
    kind: "component", version: "1", digest: rendererDigest, enabled: true,
    render: (props) => <p>{String(props.text)}</p>,
  };
  for (const type of ["FixtureParagraph", "FutureConfigOnlyParagraph"]) {
    const source = metadata(type);
    const config = await bindCityOSPuckRegistration(source, await digestCityOSPuckRegistration(source), () => installed);
    const html = renderToStaticMarkup(<Render config={config} data={{ root: {}, content: [{ type, props: { id: "stable-node", text: "نص مولّد" } }] }} />);
    expect(html).toContain("نص مولّد");
  }
});

it("does not let a cached config render after its installed code is revoked", async () => {
  const installed: CityOSPuckInstalledRenderer = {
    kind: "component", version: "1", digest: rendererDigest, enabled: true,
    render: (props) => <p>{String(props.text)}</p>,
  };
  const source = metadata("FixtureParagraph");
  const config = await bindCityOSPuckRegistration(source, await digestCityOSPuckRegistration(source), () => installed);
  installed.enabled = false;
  expect(() => renderToStaticMarkup(<Render config={config} data={{ root: {}, content: [{ type: "FixtureParagraph", props: { id: "stable-node", text: "denied" } }] }} />)).toThrow("CITYOS_PUCK_RENDERER_UNAVAILABLE");
});
