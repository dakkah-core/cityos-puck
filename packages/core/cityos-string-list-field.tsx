import React, { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash } from "lucide-react";
import type { CustomField } from "./types/Fields";
import type { CityOSPuckStringListField } from "./cityos-registration";
import {
  editCityOSStringList,
  snapshotCityOSStringList,
  type CityOSStringListEdit,
} from "./cityos-string-list";
import { useMessage } from "./lib/use-message";
import { useAppStore } from "./store";
import { IconButton } from "./components/IconButton";
import getClassNameFactory from "./lib/get-class-name-factory";
import inputStyles from "./components/AutoField/styles.module.css";
import arrayStyles from "./components/AutoField/fields/ArrayField/styles.module.css";
import styles from "./cityos-string-list-field.module.css";

const inputClass = getClassNameFactory("Input", inputStyles);
const arrayClass = getClassNameFactory("ArrayField", arrayStyles);

function ListRow({
  id,
  index,
  value,
  label,
  readOnly,
  last,
  maximum,
  edit,
  inputRef,
}: {
  id: string;
  index: number;
  value: string;
  label: string;
  readOnly: boolean;
  last: boolean;
  maximum: number;
  edit: (operation: CityOSStringListEdit, focus?: number) => void;
  inputRef: (node: HTMLTextAreaElement | null) => void;
}) {
  const item = useMessage("field-arrayitem-summary", { index: index + 1 });
  const remove = useMessage("field-arrayitem-delete");
  const up = useMessage("field-stringlist-moveup");
  const down = useMessage("field-stringlist-movedown");
  const fieldId = `${id}-item-${index}`;
  return (
    <li className={styles.row}>
      <label htmlFor={fieldId}>{`${label}: ${item}`}</label>
      <textarea
        ref={inputRef}
        className={inputClass("input")}
        id={fieldId}
        value={value}
        rows={2}
        maxLength={maximum}
        readOnly={readOnly}
        onChange={(event) =>
          edit({ type: "set", index, value: event.currentTarget.value })
        }
      />
      {!readOnly && (
        <div className={styles.actions}>
          <IconButton
            type="button"
            disabled={index === 0}
            title={`${up}: ${item}`}
            aria-label={`${up}: ${item}`}
            onClick={() =>
              edit({ type: "move", from: index, to: index - 1 }, index - 1)
            }
          >
            <ArrowUp size={16} aria-hidden="true" />
          </IconButton>
          <IconButton
            type="button"
            disabled={last}
            title={`${down}: ${item}`}
            aria-label={`${down}: ${item}`}
            onClick={() =>
              edit({ type: "move", from: index, to: index + 1 }, index + 1)
            }
          >
            <ArrowDown size={16} aria-hidden="true" />
          </IconButton>
          <IconButton
            type="button"
            title={`${remove}: ${item}`}
            aria-label={`${remove}: ${item}`}
            onClick={() => edit({ type: "remove", index }, index)}
          >
            <Trash size={16} aria-hidden="true" />
          </IconButton>
        </div>
      )}
    </li>
  );
}

/** Trusted built-in field implementation, not a callback supplied by metadata. */
function StringListEditor({
  value,
  onChange,
  readOnly: fieldReadOnly,
  id,
  definition,
}: {
  value: unknown;
  onChange: (value: string[]) => void;
  readOnly?: boolean;
  id: string;
  definition: Readonly<CityOSPuckStringListField>;
}) {
  const canEdit = useAppStore(
    (state) => state.permissions.getPermissions({ item: state.selectedItem }).edit
  );
  const readOnly = fieldReadOnly === true || canEdit !== true;
  const addLabel = useMessage("field-arrayitem-add");
  const invalidLabel = useMessage("field-stringlist-invalid");
  const [editError, setEditError] = useState(false);
  const priorInput = useRef({ id, value });
  const current = useRef(value);
  const readonlyNow = useRef(readOnly);
  const focus = useRef<number | undefined>(undefined);
  const inputs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const add = useRef<HTMLButtonElement | null>(null);
  readonlyNow.current = readOnly;
  if (priorInput.current.id !== id || priorInput.current.value !== value) {
    current.current = value;
    priorInput.current = { id, value };
  }
  useEffect(() => {
    if (focus.current === undefined || readOnly) return;
    const requested = focus.current;
    focus.current = undefined;
    const available = inputs.current.filter(
      (node): node is HTMLTextAreaElement => node !== null
    );
    const target = available[Math.min(requested, available.length - 1)];
    (target ?? add.current)?.focus();
  });

  let items: readonly string[] = [];
  let invalid = false;
  try {
    items = snapshotCityOSStringList(value, definition) ?? [];
  } catch {
    invalid = true;
  }
  const edit = (operation: CityOSStringListEdit, nextFocus?: number) => {
    if (readonlyNow.current || invalid) return;
    let result: string[];
    try {
      result = editCityOSStringList(current.current, definition, operation);
    } catch {
      setEditError(true);
      return;
    }
    // Keep consecutive edits coherent before React's next render/owner echo.
    current.current = result;
    focus.current = nextFocus;
    setEditError(false);
    onChange(result);
  };

  return (
    <fieldset className={styles.field} data-cityos-string-list="true">
      <legend>{definition.label}</legend>
      {(invalid || editError) && <p role="alert">{invalidLabel}</p>}
      {!invalid && (
        <>
          <ol className={styles.items}>
            {items.map((item, index) => (
              <ListRow
                key={index}
                id={id}
                index={index}
                value={item}
                label={definition.label}
                readOnly={readOnly}
                last={index === items.length - 1}
                maximum={definition.maxItemLength}
                edit={edit}
                inputRef={(node) => {
                  inputs.current[index] = node;
                }}
              />
            ))}
          </ol>
          {!readOnly && items.length < definition.maxItems && (
            <button
              ref={add}
              type="button"
              title={addLabel}
              aria-label={addLabel}
              className={arrayClass("addButton")}
              onClick={() =>
                edit({ type: "insert", index: items.length, value: "" }, items.length)
              }
            >
              <Plus size={21} aria-hidden="true" />
            </button>
          )}
        </>
      )}
    </fieldset>
  );
}

export function createCityOSStringListField(
  definition: Readonly<CityOSPuckStringListField>
): CustomField<string[]> {
  const field = Object.freeze({ ...definition });
  return {
    type: "custom",
    label: field.label,
    render: (props) => (
      <StringListEditor {...props} definition={field} />
    ),
  };
}
