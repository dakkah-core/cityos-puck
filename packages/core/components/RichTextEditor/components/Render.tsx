"use client";

import type { JSONContent } from "@tiptap/core";
import { useMemo, useSyncExternalStore } from "react";
import getClassNameFactory from "../../../lib/get-class-name-factory";
import styles from "../styles.module.css";
import { PuckRichText } from "../extension";
import { RichtextField } from "../../../types";
import { renderRichTextHTML } from "../lib/render-rich-text";

const getClassName = getClassNameFactory("RichTextEditor", styles);
const subscribe = () => () => {};
const browserSnapshot = () => true;
const serverSnapshot = () => false;

export function RichTextRender({
  content,
  field,
}: {
  content: string | JSONContent;
  field: RichtextField;
}) {
  const { tiptap = {}, options } = field;
  const { extensions = [] } = tiptap;
  const browserReady = useSyncExternalStore(
    subscribe,
    browserSnapshot,
    serverSnapshot,
  );

  const loadedExtensions = useMemo(
    () => [PuckRichText.configure(options), ...extensions],
    [field, extensions],
  );

  const html = useMemo(
    () => renderRichTextHTML(content, loadedExtensions, browserReady),
    [content, loadedExtensions, browserReady],
  );

  return (
    <div className={getClassName()}>
      <div className="rich-text" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
