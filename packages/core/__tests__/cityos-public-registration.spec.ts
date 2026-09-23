/** @jest-environment node */
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import * as publicApi from "../cityos";
import * as registration from "../cityos-registration";

const nodeRequire = createRequire(__filename);
const coreRoot = resolve(__dirname, "..");
const manifest = JSON.parse(
  readFileSync(resolve(coreRoot, "package.json"), "utf8")
);
// This loads the actual prepared CommonJS export with Node, not a source alias.
const compiled: typeof publicApi = nodeRequire(
  resolve(coreRoot, manifest.exports["./cityos"].require)
);
const previousCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");

beforeAll(() => {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
});
afterAll(() => {
  if (previousCrypto) {
    Object.defineProperty(globalThis, "crypto", previousCrypto);
  } else {
    Reflect.deleteProperty(globalThis, "crypto");
  }
});

const rendererDigest = "sha256:" + "a".repeat(64);
function metadata(type: string) {
  return {
    schemaVersion: registration.CITYOS_PUCK_REGISTRATION_VERSION,
    dataProfile: registration.CITYOS_PUCK_REGISTRATION_PROFILE,
    source: {
      ownerId: "core.cms",
      registryRevision: "public-entry-test-v1",
      definitionDigest: rendererDigest,
    },
    components: [
      {
        type,
        label: "Configuration-defined text",
        renderer: {
          key: "fixture.text",
          version: "1",
          digest: rendererDigest,
        },
        fields: { text: { type: "text", label: "Text" } },
      },
    ],
  };
}

describe("CityOS public registration entry", () => {
  it("re-exports the canonical registration API", () => {
    for (const [name, value] of Object.entries(registration)) {
      const descriptor = Object.getOwnPropertyDescriptor(publicApi, name);
      expect(descriptor).toBeDefined();
      expect(Reflect.get(publicApi, name)).toBe(value);
    }
  });

  it("preserves metadata in the prepared export", () => {
    expect(compiled.CITYOS_PUCK_PACKAGE).toEqual(publicApi.CITYOS_PUCK_PACKAGE);
    expect(compiled.CITYOS_PUCK_REGISTRATION_VERSION).toBe(
      registration.CITYOS_PUCK_REGISTRATION_VERSION
    );
    expect(compiled.CITYOS_PUCK_STRUCTURED_REGISTRATION_VERSION).toBe(
      registration.CITYOS_PUCK_STRUCTURED_REGISTRATION_VERSION
    );
    expect(typeof compiled.bindCityOSPuckRegistration).toBe("function");
  });

  it("binds supported names through both entrypoints", async () => {
    const installed: registration.CityOSPuckInstalledRenderer = {
      kind: "component",
      version: "1",
      digest: rendererDigest,
      enabled: true,
      render: () => null,
    };
    const source = metadata("FutureConfiguredText");
    const expected = await registration.digestCityOSPuckRegistration(source);
    for (const api of [publicApi, compiled]) {
      expect(await api.digestCityOSPuckRegistration(source)).toBe(expected);
      const config = await api.bindCityOSPuckRegistration(
        source,
        expected,
        (key) => (key === "fixture.text" ? installed : undefined)
      );
      expect(Object.keys(config.components)).toEqual(["FutureConfiguredText"]);
      expect(config.components.FutureConfiguredText.fields).toEqual({
        text: { type: "text", label: "Text" },
      });
    }
  });

  it("denies missing installed implementations", async () => {
    const source = metadata("UnavailableComponent");
    const expected = await registration.digestCityOSPuckRegistration(source);
    for (const api of [publicApi, compiled]) {
      await expect(
        api.bindCityOSPuckRegistration(source, expected, () => undefined)
      ).rejects.toThrow("CITYOS_PUCK_RENDERER_UNAVAILABLE");
    }
  });

  it("requires a pinned digest at both entrypoints", async () => {
    const source = metadata("IntegrityBoundComponent");
    for (const api of [publicApi, compiled]) {
      await expect(
        api.bindCityOSPuckRegistration(source, "sha256:" + "0".repeat(64), () => {
          throw new Error("Renderer lookup must not precede integrity checks");
        })
      ).rejects.toThrow("CITYOS_PUCK_MANIFEST_MISMATCH");
    }
  });
});
