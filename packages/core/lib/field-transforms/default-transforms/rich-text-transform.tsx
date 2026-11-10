"use client";

import type { Editor as TipTapEditor, JSONContent } from "@tiptap/react";
import {
  useEffect,
  useRef,
  useCallback,
  memo,
  MouseEvent,
  lazy,
  Suspense,
} from "react";
import { resolveAndReplaceInlineData } from "../../data/resolve-and-replace-data";

import { EditorFallback } from "../../../components/RichTextEditor/components/EditorFallback";
import { RichTextRenderFallback } from "../../../components/RichTextEditor/components/RenderFallback";
import { FieldTransforms } from "../../../types/API/FieldTransforms";
import { useAppStore, useAppStoreApi } from "../../../store";

import { RichtextField, UiState } from "../../../types";

import { getDeep } from "../../data/get-deep";
import { registerOverlayPortal } from "../../overlay-portal";

import { getSelectorForId } from "../../get-selector-for-id";
import { reportFieldEdit } from "../../../components/Puck/components/Fields/edit-alerts";

const Editor = lazy(() =>
  import("../../../components/RichTextEditor/components/Editor").then((m) => ({
    default: m.Editor,
  })),
);

const RichTextRender = lazy(() =>
  import("../../../components/RichTextEditor/components/Render").then((m) => ({
    default: m.RichTextRender,
  })),
);

const InlineEditorWrapper = memo(
  ({
    value,
    componentId,
    propPath,
    field,
    id,
  }: {
    value: string;
    componentId: string;
    propPath: string;
    field: RichtextField;
    id: string;
  }) => {
    const portalRef = useRef<HTMLDivElement>(null);
    const appStoreApi = useAppStoreApi();
    const canEdit = useAppStore((store) => {
      const item = store.state.indexes.nodes[componentId]?.data;
      const wildcardPath = propPath.replace(/\[\d+\]/g, "[*]");
      return (
        !!item &&
        !item.readOnly?.[propPath] &&
        !item.readOnly?.[wildcardPath] &&
        store.permissions.getPermissions({ item }).edit === true
      );
    });
    const editState = useRef({ canEdit, revision: 0, input: 0 });
    const editorRef = useRef<TipTapEditor | null>(null);
    if (editState.current.canEdit !== canEdit) {
      editState.current.canEdit = canEdit;
      editState.current.revision++;
    }
    useEffect(() => () => {
      editState.current.revision++;
      editorRef.current = null;
    }, []);

    const onClickHandler = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const onClickCaptureHandler = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const itemSelector = getSelectorForId(
        appStoreApi.getState().state,
        componentId,
      );

      appStoreApi.getState().setUi({ itemSelector });
    };

    // Register portal once
    useEffect(() => {
      if (!portalRef.current) return;
      const cleanup = registerOverlayPortal(portalRef.current, {
        disableDragOnFocus: true,
      });
      return () => cleanup?.();
    }, [portalRef.current]);

    const handleChange = useCallback(
      (content: string | JSONContent, ui?: Partial<UiState>) => {
        const appStore = appStoreApi.getState();
        const node = appStore.state.indexes.nodes[componentId];
        const wildcardPath = propPath.replace(/\[\d+\]/g, "[*]");
        if (
          !node ||
          node.data.readOnly?.[propPath] ||
          node.data.readOnly?.[wildcardPath] ||
          appStore.permissions.getPermissions({ item: node.data }).edit !== true
        ) {
          return;
        }

        const revision = editState.current.revision;
        const input = ++editState.current.input;
        const editor = editorRef.current;
        const target = componentId === "root"
          ? { kind: "root" as const }
          : { kind: "item" as const, id: componentId, type: node.data.type };
        const report = (reason: "canceled" | "failed") => {
          // A newer edit in this same field supersedes the draft intentionally.
          if (input === editState.current.input) {
            reportFieldEdit(appStoreApi, { field: propPath, target, reason });
          }
        };
        const restore = () => {
          if (input !== editState.current.input) return;
          const current = appStoreApi.getState();
          const item = current.state.indexes.nodes[componentId]?.data;
          if (!editor || editor.isDestroyed || !item || editorRef.current !== editor) return;
          editor.commands.setContent(getDeep(item.props, propPath) ?? "", { emitUpdate: false });
        };
        void resolveAndReplaceInlineData(
          appStoreApi,
          componentId,
          propPath,
          content,
          () => editState.current.canEdit && editState.current.revision === revision,
          ui,
        ).then((applied) => {
          if (!applied) {
            restore();
            report("canceled");
          }
        }).catch(() => {
          restore();
          report("failed");
          console.error("Puck could not apply the inline rich text edit.");
        });
      },
      [appStoreApi, componentId, propPath],
    );

    const handleFocus = useCallback(
      (editor: TipTapEditor) => {
        editorRef.current = editor;
        appStoreApi.setState({
          currentRichText: {
            inlineComponentId: componentId,
            inline: true,
            field,
            editor,
            id,
          },
        });
      },
      [field, componentId],
    );

    if (!field.contentEditable || !canEdit)
      return (
        <Suspense fallback={<RichTextRenderFallback content={value} />}>
          <RichTextRender content={value} field={field} />
        </Suspense>
      );

    const editorProps = {
      content: value,
      onChange: handleChange,
      field: field,
      inline: true,
      onFocus: handleFocus,
      id: id,
      name: propPath,
    };

    return (
      <div
        ref={portalRef}
        onClick={onClickHandler}
        onClickCapture={onClickCaptureHandler}
      >
        <Suspense fallback={<EditorFallback {...editorProps} />}>
          <Editor {...editorProps} />
        </Suspense>
      </div>
    );
  },
);

InlineEditorWrapper.displayName = "InlineEditorWrapper";

export const getRichTextTransform = (): FieldTransforms => ({
  richtext: ({ value, componentId, field, propPath, isReadOnly }) => {
    const { contentEditable = true, tiptap } = field;
    if (contentEditable === false || isReadOnly) {
      return <RichTextRender content={value} field={field} />;
    }

    const id = `${componentId}_${field.type}_${propPath}`;

    return (
      <InlineEditorWrapper
        key={id}
        value={value}
        componentId={componentId}
        propPath={propPath}
        field={field}
        id={id}
      />
    );
  },
});
