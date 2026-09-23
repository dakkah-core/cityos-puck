/** @jest-environment node */
import { webcrypto } from "node:crypto";
import {
  CITYOS_PUCK_REGISTRATION_VERSION,
  CITYOS_PUCK_STRUCTURED_REGISTRATION_VERSION,
  bindCityOSPuckRegistration,
  digestCityOSPuckRegistration,
  parseCityOSPuckRegistration,
  type CityOSPuckField,
  type CityOSPuckInstalledRenderer,
  type CityOSPuckRegistrationManifest,
} from "../cityos-registration";
import {
  fixtureDigest,
  fixtureFields,
  structuredRegistration,
} from "../__helpers__/cityos-structured-registration";

beforeAll(() => {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
});

const text = (): CityOSPuckField => ({ type: "text", label: "Text" });
function nested(depth: number): CityOSPuckField {
  return depth === 0
    ? text()
    : {
        type: "object",
        label: "Nested",
        objectFields: { child: nested(depth - 1) },
      };
}
function installed(): CityOSPuckInstalledRenderer {
  return {
    kind: "component",
    enabled: true,
    version: "1",
    digest: fixtureDigest,
    render: () => null,
  };
}
async function bind(
  source: CityOSPuckRegistrationManifest,
  renderer = installed()
) {
  return bindCityOSPuckRegistration(
    source,
    await digestCityOSPuckRegistration(source),
    () => renderer
  );
}

describe("versioned compiler-generated structured fields", () => {
  it("binds recursive native fields without executable metadata", async () => {
    const source = structuredRegistration();
    const parsed = parseCityOSPuckRegistration(source);
    const config = await bind(source);
    expect(parsed.schemaVersion).toBe(
      CITYOS_PUCK_STRUCTURED_REGISTRATION_VERSION
    );
    expect(config.components.GeneratedProfile.fields).toEqual(fixtureFields());
    expect(Object.isFrozen(parsed.components[0].fields)).toBe(true);
    expect(config.components.GeneratedProfile.defaultProps).toBeUndefined();
    const rows = config.components.GeneratedProfile.fields?.rows;
    expect(rows?.type).toBe("array");
    if (rows?.type !== "array") throw new Error("Expected native array");
    expect(rows.defaultItemProps).toBeUndefined();
    expect(rows.getItemSummary).toBeUndefined();
  });

  it("preserves V1 scalar manifests without silently upgrading them", () => {
    const source = structuredRegistration({ text: text() });
    source.schemaVersion = CITYOS_PUCK_REGISTRATION_VERSION;
    expect(parseCityOSPuckRegistration(source)).toEqual(source);
  });

  it.each(["profile", "rows", "enabled"])(
    "does not accept the %s V2 primitive under V1",
    (name) => {
      const source = structuredRegistration({ [name]: fixtureFields()[name] });
      source.schemaVersion = CITYOS_PUCK_REGISTRATION_VERSION;
      expect(() => parseCityOSPuckRegistration(source)).toThrow(
        "CITYOS_PUCK_UNSUPPORTED_FIELD"
      );
    }
  );

  it.each(["value.name", "rows[0]", "bad-name", "0name", "bad name"])(
    "rejects the ambiguous V2 field name %s",
    (name) => {
      const source = structuredRegistration({ [name]: text() });
      expect(() => parseCityOSPuckRegistration(source)).toThrow();
    }
  );

  it("keeps the original V1 name grammar explicit", () => {
    const source = structuredRegistration({ "legacy.name": text() });
    source.schemaVersion = CITYOS_PUCK_REGISTRATION_VERSION;
    expect(parseCityOSPuckRegistration(source)).toEqual(source);
  });

  it("allows nested domain IDs without replacing the node ID", () => {
    const source = structuredRegistration();
    expect(() => parseCityOSPuckRegistration(source)).not.toThrow();
    expect(() =>
      parseCityOSPuckRegistration(structuredRegistration({ id: text() }))
    ).toThrow("SYSTEM_FIELD");
  });

  it.each(["object", "array"])("rejects slots nested inside %s data", (type) => {
    const slot = { type: "slot", label: "Slot", allow: [] };
    const raw = {
      type,
      label: "Nested",
      ...(type === "array"
        ? { min: 0, max: 2, arrayFields: { child: slot } }
        : { objectFields: { child: slot } }),
    };
    const source = structuredRegistration();
    Object.assign(source.components[0].fields, { nested: raw });
    expect(() => parseCityOSPuckRegistration(source)).toThrow("NESTED_SLOT");
  });

  it.each([
    [-1, 2],
    [3, 2],
    [0, 1001],
    [0.5, 2],
    [0, 2.5],
  ])("rejects array cardinality %s..%s", (min, max) => {
    const source = structuredRegistration({
      rows: {
        type: "array",
        label: "Rows",
        min,
        max,
        arrayFields: { a: text() },
      },
    });
    expect(() => parseCityOSPuckRegistration(source)).toThrow("ARRAY_BOUNDS");
  });

  it("requires explicit array bounds", () => {
    const source = structuredRegistration();
    Reflect.deleteProperty(source.components[0].fields.rows, "max");
    expect(() => parseCityOSPuckRegistration(source)).toThrow("SHAPE");
  });

  it("admits an explicitly empty array capacity", () => {
    const source = structuredRegistration({
      rows: {
        type: "array",
        label: "Rows",
        min: 0,
        max: 0,
        arrayFields: { value: text() },
      },
    });
    expect(parseCityOSPuckRegistration(source)).toEqual(source);
  });

  it("rejects an empty nested field map", () => {
    const source = structuredRegistration({
      object: { type: "object", label: "Empty", objectFields: {} },
    });
    expect(() => parseCityOSPuckRegistration(source)).toThrow("FIELDS");
  });

  it("bounds schema depth independently of the JSON budget", () => {
    expect(() =>
      parseCityOSPuckRegistration(structuredRegistration({ value: nested(4) }))
    ).not.toThrow();
    expect(() =>
      parseCityOSPuckRegistration(structuredRegistration({ value: nested(5) }))
    ).toThrow("FIELD_DEPTH");
  });

  it("counts all nested fields toward one per-entry limit", () => {
    const fields: Record<string, CityOSPuckField> = {};
    for (let group = 0; group < 4; group += 1) {
      fields[`group${group}`] = {
        type: "object",
        label: "Group",
        objectFields: Object.fromEntries(
          Array.from({ length: 127 }, (_, i) => [`field${i}`, text()])
        ),
      };
    }
    const source = structuredRegistration(fields);
    expect(() => parseCityOSPuckRegistration(source)).not.toThrow();
    fields.extra = text();
    expect(() => parseCityOSPuckRegistration(source)).toThrow("FIELD_COUNT");
  });

  it.each(["defaultItemProps", "getItemSummary", "render", "permissions"])(
    "does not accept nested %s instructions",
    (name) => {
      const source = structuredRegistration();
      Object.assign(source.components[0].fields.rows, { [name]: {} });
      expect(() => parseCityOSPuckRegistration(source)).toThrow("SHAPE");
    }
  );

  it("rejects a nested accessor before executing it", () => {
    const source = structuredRegistration();
    const accessor = jest.fn(() => text());
    const fields = Object.defineProperty({}, "field", {
      enumerable: true,
      get: accessor,
    });
    Object.assign(source.components[0].fields.profile, { objectFields: fields });
    expect(() => parseCityOSPuckRegistration(source)).toThrow("DATA_ONLY");
    expect(accessor).not.toHaveBeenCalled();
  });

  it("does not pretend to implement rich-text registration", () => {
    const source = structuredRegistration();
    Object.assign(source.components[0].fields.profile, { type: "richtext" });
    expect(() => parseCityOSPuckRegistration(source)).toThrow(
      "UNSUPPORTED_FIELD"
    );
  });

  it("isolates nested editor config from its verified input", async () => {
    const source = structuredRegistration();
    const before = JSON.stringify(source);
    const first = await bind(source);
    const second = await bind(source);
    const profile = first.components.GeneratedProfile.fields?.profile;
    if (profile?.type !== "object") throw new Error("Expected object");
    profile.objectFields.name.label = "Local edit";
    expect(JSON.stringify(source)).toBe(before);
    expect(second.components.GeneratedProfile.fields).toEqual(fixtureFields());
  });

  it("captures source before asynchronous hashing", async () => {
    const source = structuredRegistration();
    const digest = await digestCityOSPuckRegistration(source);
    const pending = bindCityOSPuckRegistration(source, digest, installed);
    source.components[0].fields.profile.label = "Changed";
    expect((await pending).components.GeneratedProfile.fields).toEqual(
      fixtureFields()
    );
  });

  it("does not resolve code until the entire schema passes", async () => {
    const source = structuredRegistration();
    Object.assign(source.components[0].fields.rows, { max: 1001 });
    const resolver = jest.fn(installed);
    await expect(
      bindCityOSPuckRegistration(source, fixtureDigest, resolver)
    ).rejects.toThrow("ARRAY_BOUNDS");
    expect(resolver).not.toHaveBeenCalled();
  });

  it("rechecks renderer revocation with structured configs", async () => {
    const renderer = installed();
    const config = await bind(structuredRegistration(), renderer);
    renderer.enabled = false;
    expect(() =>
      config.components.GeneratedProfile.render({ id: "node", puck: {} } as never)
    ).toThrow("RENDERER_UNAVAILABLE");
  });

  it("rejects changed fields under an earlier digest", async () => {
    const source = structuredRegistration();
    const digest = await digestCityOSPuckRegistration(source);
    const rows = source.components[0].fields.rows;
    if (rows.type !== "array") throw new Error("Expected array");
    rows.max = 3;
    await expect(
      bindCityOSPuckRegistration(source, digest, installed)
    ).rejects.toThrow("MANIFEST_MISMATCH");
  });

  it("exports the new contract in the prepared package", () => {
    const built = require("../dist/cityos.js");
    expect(built.CITYOS_PUCK_STRUCTURED_REGISTRATION_VERSION).toBe(
      CITYOS_PUCK_STRUCTURED_REGISTRATION_VERSION
    );
    expect(built.parseCityOSPuckRegistration(structuredRegistration())).toEqual(
      structuredRegistration()
    );
  });
});
