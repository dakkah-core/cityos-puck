/** Scalar-list editing preserves values; this is not an owner authorization boundary. */
export interface CityOSStringListLimits {
  readonly maxItems: number;
  readonly maxItemLength: number;
}
export type CityOSStringListEdit =
  | { readonly type: "insert"; readonly index: number; readonly value: string }
  | { readonly type: "set"; readonly index: number; readonly value: string }
  | { readonly type: "remove"; readonly index: number }
  | { readonly type: "move"; readonly from: number; readonly to: number };

function fail(code: string): never {
  throw new Error(`CITYOS_STRING_LIST_${code}`);
}
function limits(value: CityOSStringListLimits): void {
  if (
    !value ||
    !Number.isSafeInteger(value.maxItems) ||
    value.maxItems < 0 ||
    value.maxItems > 1000 ||
    !Number.isSafeInteger(value.maxItemLength) ||
    value.maxItemLength < 0 ||
    value.maxItemLength > 100_000
  )
    fail("BOUNDS");
}
function text(value: unknown, maximum: number): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length > maximum ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
  )
    fail("VALUE");
}
/** Undefined remains absent. No trimming, splitting, defaults or string coercion. */
export function snapshotCityOSStringList(
  value: unknown,
  bounds: CityOSStringListLimits
): readonly string[] | undefined {
  limits(bounds);
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.length > bounds.maxItems ||
    Reflect.ownKeys(value).length !== value.length + 1
  )
    fail("VALUE");
  const result: string[] = [];
  for (let index = 0; index < value.length; index++) {
    const property = Object.getOwnPropertyDescriptor(value, String(index));
    if (!property || !property.enumerable || !("value" in property))
      fail("VALUE");
    text(property.value, bounds.maxItemLength);
    result.push(property.value);
  }
  return Object.freeze(result);
}
function index(value: number, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum)
    fail("INDEX");
}
/** One explicit local edit; never mutates the caller's array. */
export function editCityOSStringList(
  value: unknown,
  bounds: CityOSStringListLimits,
  edit: CityOSStringListEdit
): string[] {
  const result = [...(snapshotCityOSStringList(value, bounds) ?? [])];
  switch (edit.type) {
    case "insert":
      index(edit.index, result.length);
      text(edit.value, bounds.maxItemLength);
      if (result.length >= bounds.maxItems) fail("CAPACITY");
      result.splice(edit.index, 0, edit.value);
      break;
    case "set":
      index(edit.index, result.length - 1);
      text(edit.value, bounds.maxItemLength);
      result[edit.index] = edit.value;
      break;
    case "remove":
      index(edit.index, result.length - 1);
      result.splice(edit.index, 1);
      break;
    case "move": {
      index(edit.from, result.length - 1);
      index(edit.to, result.length - 1);
      const [item] = result.splice(edit.from, 1);
      result.splice(edit.to, 0, item);
      break;
    }
    default:
      fail("EDIT");
  }
  return result;
}
