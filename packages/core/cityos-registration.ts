import type { Config } from "./types/Config";
import type { Field } from "./types/Fields";

/** A target artifact, not a CityOS owner/capability/permission registry. */
export const CITYOS_PUCK_REGISTRATION_VERSION = "cityos.puck.registration.v1";
export const CITYOS_PUCK_STRUCTURED_REGISTRATION_VERSION =
  "cityos.puck.registration.v2";
export const CITYOS_PUCK_REGISTRATION_PROFILE =
  "cityos.puck-slots.v0.23.native-screen.v2";
export const CITYOS_PUCK_STRUCTURED_FIELD_LIMITS = Object.freeze({
  depth: 4,
  fieldsPerEntry: 512,
  arrayItems: 1000,
});

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type CityOSPuckField =
  | { type: "text" | "textarea"; label: string }
  | { type: "number"; label: string; min: number; max: number; step?: number }
  | {
      type: "select" | "radio";
      label: string;
      options: { label: string; value: string | number | boolean | null }[];
    }
  | { type: "slot"; label: string; allow: string[] }
  | {
      type: "object";
      label: string;
      objectFields: Record<string, CityOSPuckField>;
    }
  | {
      type: "array";
      label: string;
      min: number;
      max: number;
      arrayFields: Record<string, CityOSPuckField>;
    };
export interface CityOSPuckRendererRef {
  key: string;
  version: string;
  digest: string;
}
export interface CityOSPuckRegistrationEntry {
  type: string;
  label: string;
  renderer: CityOSPuckRendererRef;
  fields: Record<string, CityOSPuckField>;
}
export interface CityOSPuckRegistrationManifest {
  schemaVersion:
    | typeof CITYOS_PUCK_REGISTRATION_VERSION
    | typeof CITYOS_PUCK_STRUCTURED_REGISTRATION_VERSION;
  dataProfile: typeof CITYOS_PUCK_REGISTRATION_PROFILE;
  source: {
    ownerId: string;
    registryRevision: string;
    definitionDigest: string;
  };
  components: CityOSPuckRegistrationEntry[];
  root?: Omit<CityOSPuckRegistrationEntry, "type">;
}
export interface CityOSPuckInstalledRenderer {
  kind: "component" | "root";
  version: string;
  digest: string;
  enabled: boolean;
  render: Config["components"][string]["render"];
}
/** The host resolves this from its admitted build, not from author-editable URLs. */
export type CityOSPuckRendererResolver = (
  key: string
) => CityOSPuckInstalledRenderer | undefined;

const digestPattern = /^sha256:[a-f0-9]{64}$/;
const keyPattern = /^[a-zA-Z][a-zA-Z0-9_.-]{0,127}$/;
const fieldNamePattern = /^[a-zA-Z][a-zA-Z0-9_]{0,127}$/;
const unsafeKeys = new Set(["__proto__", "prototype", "constructor"]);
function fail(code: string): never {
  throw new Error(`CITYOS_PUCK_${code}`);
}

/** Snapshot only data properties, before any asynchronous digest work. */
function copyData(input: unknown): Json {
  const ancestors = new Set<object>();
  let nodes = 0;
  const visit = (value: unknown, depth: number): Json => {
    if (++nodes > 30_000 || depth > 24) fail("INPUT_LIMIT");
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (value.length > 131_072) fail("INPUT_LIMIT");
      return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (!value || typeof value !== "object" || ancestors.has(value))
      fail("DATA_ONLY");
    const array = Array.isArray(value);
    if (
      !array &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    )
      fail("DATA_ONLY");
    ancestors.add(value);
    const result: Json[] | Record<string, Json> = array ? [] : {};
    if (array && value.length > 4096) fail("INPUT_LIMIT");
    for (const key of Reflect.ownKeys(value)) {
      if (array && key === "length") continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (
        typeof key !== "string" ||
        unsafeKeys.has(key) ||
        !("value" in descriptor) ||
        !descriptor.enumerable ||
        (array && !/^(0|[1-9][0-9]*)$/.test(key))
      )
        fail("DATA_ONLY");
      (result as Record<string, Json>)[key] = visit(
        descriptor.value,
        depth + 1
      );
    }
    if (array && Object.keys(result).length !== value.length) fail("DATA_ONLY");
    ancestors.delete(value);
    return result;
  };
  return visit(input, 0);
}
function object(
  value: Json,
  keys: string[],
  optional: string[] = []
): Record<string, Json> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key)) ||
    Object.keys(value).some(
      (key) => !keys.includes(key) && !optional.includes(key)
    )
  )
    fail("SHAPE");
  return value as Record<string, Json>;
}
function text(value: Json, max = 512): asserts value is string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    fail("TEXT");
}
function key(value: Json): asserts value is string {
  text(value, 128);
  if (!keyPattern.test(value) || unsafeKeys.has(value)) fail("KEY");
}
function hash(value: Json): void {
  if (typeof value !== "string" || !digestPattern.test(value)) fail("DIGEST");
}

/** Validate the schema tree, not authored values or the user's authority. */
function validateFields(
  input: Json,
  knownTypes: Set<string>,
  structured: boolean,
  depth = 0,
  budget = { count: 0 }
): void {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).length > 128 ||
    (depth > 0 && Object.keys(input).length === 0)
  )
    fail("FIELDS");
  if (depth > CITYOS_PUCK_STRUCTURED_FIELD_LIMITS.depth) fail("FIELD_DEPTH");
  for (const [name, raw] of Object.entries(input)) {
    if (++budget.count > CITYOS_PUCK_STRUCTURED_FIELD_LIMITS.fieldsPerEntry)
      fail("FIELD_COUNT");
    key(name);
    // V2 names are path segments, not paths interpreted by Puck's nested editor.
    // Keep the existing V1 identifier contract unchanged.
    if (structured && !fieldNamePattern.test(name)) fail("FIELD_NAME");
    if (depth === 0 && ["id", "type", "puck", "editMode"].includes(name))
      fail("SYSTEM_FIELD");
    const field = object(
      raw,
      ["type", "label"],
      ["min", "max", "step", "options", "allow", "objectFields", "arrayFields"]
    );
    text(field.label);
    switch (field.type) {
      case "text":
      case "textarea":
        object(raw, ["type", "label"]);
        break;
      case "number": {
        object(raw, ["type", "label", "min", "max"], ["step"]);
        if (
          typeof field.min !== "number" ||
          typeof field.max !== "number" ||
          field.min > field.max ||
          (field.step !== undefined &&
            (typeof field.step !== "number" || field.step <= 0))
        )
          fail("NUMBER_BOUNDS");
        break;
      }
      case "radio":
      case "select": {
        if (field.type === "radio" && !structured) fail("UNSUPPORTED_FIELD");
        object(raw, ["type", "label", "options"]);
        if (
          !Array.isArray(field.options) ||
          !field.options.length ||
          field.options.length > 256
        )
          fail("OPTIONS");
        const seen = new Set<string>();
        for (const rawOption of field.options) {
          const option = object(rawOption, ["label", "value"]);
          text(option.label);
          if (
            option.value !== null &&
            !["string", "number", "boolean"].includes(typeof option.value)
          )
            fail("OPTIONS");
          const identity = JSON.stringify(option.value);
          if (seen.has(identity)) fail("OPTIONS");
          seen.add(identity);
        }
        break;
      }
      case "slot": {
        object(raw, ["type", "label", "allow"]);
        if (depth > 0) fail("NESTED_SLOT");
        if (
          !Array.isArray(field.allow) ||
          field.allow.length > 1024 ||
          new Set(field.allow).size !== field.allow.length
        )
          fail("SLOT");
        for (const type of field.allow) {
          key(type);
          if (!knownTypes.has(type)) fail("SLOT_REFERENCE");
        }
        break;
      }
      case "object":
      case "array": {
        if (!structured) fail("UNSUPPORTED_FIELD");
        const array = field.type === "array";
        const childKey = array ? "arrayFields" : "objectFields";
        object(
          raw,
          array
            ? ["type", "label", childKey, "min", "max"]
            : ["type", "label", childKey]
        );
        if (
          array &&
          (typeof field.min !== "number" ||
            typeof field.max !== "number" ||
            !Number.isSafeInteger(field.min) ||
            !Number.isSafeInteger(field.max) ||
            field.min < 0 ||
            field.min > field.max ||
            field.max > CITYOS_PUCK_STRUCTURED_FIELD_LIMITS.arrayItems)
        )
          fail("ARRAY_BOUNDS");
        validateFields(field[childKey], knownTypes, true, depth + 1, budget);
        break;
      }
      default:
        fail("UNSUPPORTED_FIELD");
    }
  }
}
function validateEntry(
  value: Json,
  component: boolean,
  knownTypes: Set<string>,
  structured: boolean
): void {
  const entry = object(
    value,
    component
      ? ["type", "label", "renderer", "fields"]
      : ["label", "renderer", "fields"]
  );
  if (component) key(entry.type);
  text(entry.label);
  const renderer = object(entry.renderer, ["key", "version", "digest"]);
  key(renderer.key);
  text(renderer.version, 128);
  hash(renderer.digest);
  validateFields(entry.fields, knownTypes, structured);
}
function canonical(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
export function parseCityOSPuckRegistration(
  input: unknown
): CityOSPuckRegistrationManifest {
  const snapshot = copyData(input);
  const manifest = object(
    snapshot,
    ["schemaVersion", "dataProfile", "source", "components"],
    ["root"]
  );
  const structured =
    manifest.schemaVersion === CITYOS_PUCK_STRUCTURED_REGISTRATION_VERSION;
  if (
    (!structured &&
      manifest.schemaVersion !== CITYOS_PUCK_REGISTRATION_VERSION) ||
    manifest.dataProfile !== CITYOS_PUCK_REGISTRATION_PROFILE
  )
    fail("PROFILE");
  const source = object(manifest.source, [
    "ownerId",
    "registryRevision",
    "definitionDigest",
  ]);
  text(source.ownerId, 128);
  text(source.registryRevision, 128);
  hash(source.definitionDigest);
  if (
    !/^(core|shared|vertical)\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(
      source.ownerId
    )
  )
    fail("OWNER_REFERENCE");
  if (!Array.isArray(manifest.components) || manifest.components.length > 1024)
    fail("COMPONENT_LIMIT");
  const types = new Set<string>();
  for (const raw of manifest.components) {
    const entry = object(raw, ["type", "label", "renderer", "fields"]);
    key(entry.type);
    if (types.has(entry.type)) fail("DUPLICATE_COMPONENT");
    types.add(entry.type);
  }
  manifest.components.forEach((entry) =>
    validateEntry(entry, true, types, structured)
  );
  if (manifest.root !== undefined)
    validateEntry(manifest.root, false, types, structured);
  if (new TextEncoder().encode(canonical(snapshot)).byteLength > 1_048_576)
    fail("INPUT_LIMIT");
  return freeze(snapshot as unknown as CityOSPuckRegistrationManifest);
}
async function sha256(value: Json): Promise<string> {
  if (!globalThis.crypto?.subtle) fail("DIGEST_UNAVAILABLE");
  const bytes = new TextEncoder().encode(canonical(value));
  const result = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return (
    "sha256:" +
    Array.from(new Uint8Array(result), (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("")
  );
}
/** Hash normalized target metadata; this is integrity, not an authorization grant. */
export async function digestCityOSPuckRegistration(
  input: unknown
): Promise<string> {
  return sha256(parseCityOSPuckRegistration(input) as unknown as Json);
}
function resolveRenderer(
  ref: CityOSPuckRendererRef,
  kind: "component" | "root",
  resolver: CityOSPuckRendererResolver
): CityOSPuckInstalledRenderer {
  const installed = resolver(ref.key);
  if (
    !installed ||
    installed.enabled !== true ||
    installed.kind !== kind ||
    installed.version !== ref.version ||
    installed.digest !== ref.digest ||
    typeof installed.render !== "function"
  )
    fail("RENDERER_UNAVAILABLE");
  return installed;
}
/** Construct mutable Puck fields from validated metadata without a JSON cast. */
function cloneFields(
  fields: Record<string, CityOSPuckField>
): Record<string, Field> {
  return Object.fromEntries(
    Object.entries(fields).map(([name, field]): [string, Field] => {
      switch (field.type) {
        case "text":
          return [name, { type: "text", label: field.label }];
        case "textarea":
          return [name, { type: "textarea", label: field.label }];
        case "number":
          return [name, { ...field }];
        case "select":
          return [
            name,
            { ...field, options: field.options.map((o) => ({ ...o })) },
          ];
        case "radio":
          return [
            name,
            { ...field, options: field.options.map((o) => ({ ...o })) },
          ];
        case "slot":
          return [name, { ...field, allow: [...field.allow] }];
        case "object":
          return [
            name,
            {
              type: "object",
              label: field.label,
              objectFields: cloneFields(field.objectFields),
            },
          ];
        case "array":
          return [
            name,
            {
              type: "array",
              label: field.label,
              min: field.min,
              max: field.max,
              arrayFields: cloneFields(field.arrayFields),
            },
          ];
      }
    })
  );
}
/**
 * Bind only installed, admitted functions. This never imports code, fills hidden
 * defaults, grants permissions, saves documents or calls an owner operation.
 * The BFF must authorize the source; the owner must reauthorize every mutation.
 */
export async function bindCityOSPuckRegistration(
  input: unknown,
  expectedManifestDigest: string,
  resolver: CityOSPuckRendererResolver
): Promise<Config> {
  if (
    !digestPattern.test(expectedManifestDigest) ||
    typeof resolver !== "function"
  )
    fail("ADMISSION_REQUIRED");
  const manifest = parseCityOSPuckRegistration(input);
  if ((await sha256(manifest as unknown as Json)) !== expectedManifestDigest)
    fail("MANIFEST_MISMATCH");
  const bind = (
    entry: Omit<CityOSPuckRegistrationEntry, "type">,
    kind: "component" | "root"
  ) => {
    const installed = resolveRenderer(entry.renderer, kind, resolver);
    const render = installed.render;
    return {
      label: entry.label,
      fields: cloneFields(entry.fields),
      render: ((props: Parameters<typeof render>[0]) => {
        const current = resolveRenderer(entry.renderer, kind, resolver);
        if (current.render !== render) fail("RENDERER_CHANGED");
        return render(props);
      }) as typeof render,
    };
  };
  const components: Config["components"] = {};
  for (const entry of manifest.components)
    components[entry.type] = bind(entry, "component");
  const root = manifest.root ? bind(manifest.root, "root") : undefined;
  return { components, ...(root ? { root } : {}) };
}
