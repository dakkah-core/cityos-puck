"use client";

import { memo, useEffect, useRef, useState } from "react";

import { registerOverlayPortal } from "../../lib/overlay-portal";
import { useAppStoreApi } from "../../store";

import getClassNameFactory from "../../lib/get-class-name-factory";
import { resolveAndReplaceInlineData } from "../../lib/data/resolve-and-replace-data";
import { getSelectorForId } from "../../lib/get-selector-for-id";
import { getDeep } from "../../lib/data/get-deep";
import { reportFieldEdit } from "../Puck/components/Fields/edit-alerts";

import styles from "./styles.module.css";

const getClassName = getClassNameFactory("InlineTextField", styles);

const InlineTextFieldInternal = ({
  placeholder,
  propPath,
  componentId,
  value,
  isReadOnly,
  opts = {},
}: {
  placeholder?: string;
  propPath: string;
  value: string | null | undefined;
  componentId: string;
  isReadOnly: boolean;
  opts?: { disableLineBreaks?: boolean };
}) => {
  const ref = useRef<HTMLHeadingElement>(null);
  const appStoreApi = useAppStoreApi();
  const disableLineBreaks = opts.disableLineBreaks ?? false;
  const editState = useRef({ isReadOnly, revision: 0, input: 0 });
  if (editState.current.isReadOnly !== isReadOnly) {
    editState.current.isReadOnly = isReadOnly;
    editState.current.revision++;
  }
  useEffect(
    () => () => {
      editState.current.revision++;
    },
    [],
  );

  useEffect(() => {
    const appStore = appStoreApi.getState();
    const data = appStore.state.indexes.nodes[componentId].data;
    const componentConfig = appStore.getComponentConfig(data.type);

    if (!componentConfig) {
      throw new Error(
        `InlineTextField Error: No config defined for ${data.type}`,
      );
    }

    if (ref.current) {
      // Coerce nullish values to "" — Node.replaceChildren stringifies non-Node
      // args, so passing null/undefined renders the literal text "null"/"undefined".
      const safeValue = value ?? "";

      // Replace when the user has edited the value or when the value is empty to
      // remove any elements inserted by the browser that would break placeholder
      // styling (e.g. <br>).
      if (!safeValue || safeValue !== ref.current.innerText) {
        ref.current.replaceChildren(safeValue);
      }

      const cleanupPortal = registerOverlayPortal(ref.current);

      const handleInput = (e: any) => {
        if (isReadOnly) return;
        let value = e.target.innerText;

        if (disableLineBreaks) {
          value = value.replaceAll(/\n/gm, "");
        }

        const revision = editState.current.revision;
        const input = ++editState.current.input;
        const target = componentId === "root"
          ? { kind: "root" as const }
          : { kind: "item" as const, id: componentId, type: data.type };
        const report = (reason: "canceled" | "failed") => {
          if (input === editState.current.input) {
            reportFieldEdit(appStoreApi, { field: propPath, target, reason });
          }
        };
        const restore = () => {
          if (input !== editState.current.input || !ref.current) return;
          const node = appStoreApi.getState().state.indexes.nodes[componentId];
          if (node)
            ref.current.replaceChildren(getDeep(node.data.props, propPath) ?? "");
        };
        void resolveAndReplaceInlineData(
          appStoreApi,
          componentId,
          propPath,
          value,
          () =>
            !editState.current.isReadOnly &&
            editState.current.revision === revision,
        )
          .then((applied) => {
            if (!applied) {
              restore();
              report("canceled");
            }
          })
          .catch(() => {
            restore();
            report("failed");
            console.error("Puck could not apply the inline text edit.");
          });
      };

      ref.current.addEventListener("input", handleInput);

      return () => {
        ref.current?.removeEventListener("input", handleInput);

        cleanupPortal?.();
      };
    }
  }, [
    appStoreApi,
    componentId,
    propPath,
    ref.current,
    value,
    isReadOnly,
    disableLineBreaks,
  ]);

  // We disable contentEditable when not hovering or already focused,
  // otherwise Safari focuses the element during drag. Related:
  // https://bugs.webkit.org/show_bug.cgi?id=112854
  const [isHovering, setIsHovering] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  return (
    <span
      className={getClassName()}
      data-placeholder={placeholder}
      ref={ref}
      contentEditable={
        !isReadOnly && (isHovering || isFocused) ? "plaintext-only" : "false"
      }
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClickCapture={(e) => {
        e.preventDefault();
        e.stopPropagation();

        const itemSelector = getSelectorForId(
          appStoreApi.getState().state,
          componentId,
        );

        appStoreApi.getState().setUi({ itemSelector });
      }}
      onKeyDown={(e) => {
        e.stopPropagation();

        if ((disableLineBreaks && e.key === "Enter") || isReadOnly) {
          e.preventDefault();
        }
      }}
      onKeyUp={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      onMouseOverCapture={() => setIsHovering(true)}
      onMouseOutCapture={() => setIsHovering(false)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
    />
  );
};

export const InlineTextField = memo(InlineTextFieldInternal);
