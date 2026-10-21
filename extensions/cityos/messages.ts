import type { Dictionary } from "@cityos-core/puck";

const messages = {
  "field-arrayitem-summary": "Item #{index}",
  "field-arrayitem-add": "Add item",
  "field-arrayitem-delete": "Delete",
  "field-stringlist-moveup": "Move up",
  "field-stringlist-movedown": "Move down",
  "field-stringlist-invalid":
    "The value does not match this list field. No change was applied.",
} as const;

export function getMessage(
  dictionary: Readonly<Dictionary>,
  key: keyof typeof messages,
  params: Record<string, string | number> = {},
): string {
  return (dictionary[key] ?? messages[key]).replace(
    /\{(\w+)\}/g,
    (match, name) =>
      params[name] === undefined ? match : String(params[name]),
  );
}
