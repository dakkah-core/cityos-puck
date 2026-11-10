import { useEditor } from "@tiptap/react";
import type { Extensions, JSONContent, Editor } from "@tiptap/react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useDebouncedCallback } from "use-debounce";
import { UiState } from "../../../types";
import { useAppStoreApi } from "../../../store";

export function useSyncedEditor({
  content,
  onChange,
  extensions,
  editable = true,
  onFocusChange,
  name,
}: {
  content: JSONContent | string;
  onChange: (content: JSONContent | string, uiState?: Partial<UiState>) => void;
  extensions: Extensions;
  editable?: boolean;
  onFocusChange?: (editor: Editor | null) => void;
  name: string | undefined;
}) {
  const appStoreApi = useAppStoreApi();
  const editableRef = useRef(editable);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const publishChange = useDebouncedCallback(
    (draft: { from: number; to: number; html: string }) => {
      if (!editableRef.current) return;
      const { ui } = appStoreApi.getState().state;
      onChangeRef.current(draft.html, {
        field: {
          ...ui.field,
          metadata: { from: draft.from, to: draft.to },
        },
      });
    },
    50,
    { leading: true, maxWait: 200 },
  );

  const syncingRef = useRef(false);
  const lastSyncedRef = useRef("");
  const editTimer = useRef<NodeJS.Timeout>(null);

  const resetTimer = (clearOn: string) => {
    if (editTimer.current) {
      clearTimeout(editTimer.current);
    }

    editTimer.current = setTimeout(() => {
      if (lastSyncedRef.current === clearOn) {
        editTimer.current = null;
      }
    }, 200);
  };

  const editor = useEditor({
    extensions,
    content,
    editable,
    immediatelyRender: false,
    parseOptions: { preserveWhitespace: "full" },
    onUpdate: ({ editor }) => {
      const isFocused = appStoreApi.getState().state.ui.field.focus === name;

      // This can trigger during undo/redo history loads
      if (syncingRef.current || !isFocused || !editableRef.current) {
        return;
      }

      const html = editor.getHTML();

      const { from, to } = editor.state.selection;

      publishChange({ from, to, html });
      resetTimer(html);

      lastSyncedRef.current = html;
    },
  });

  useEffect(() => {
    if (!editor) return;

    const handleFocus = () => {
      onFocusChange?.(editor);
    };

    editor.on("focus", handleFocus);
    return () => {
      editor.off("focus", handleFocus);
    };
  }, [editor, onFocusChange]);

  useLayoutEffect(() => {
    editableRef.current = editable;
    if (!editable) {
      publishChange.cancel();
      if (editTimer.current) clearTimeout(editTimer.current);
      editTimer.current = null;
      lastSyncedRef.current = "";
    }
  }, [editable, publishChange]);

  useLayoutEffect(
    () => () => {
      publishChange.cancel();
      if (editTimer.current) clearTimeout(editTimer.current);
    },
    [publishChange],
  );

  useEffect(() => {
    // Changing editability must not emit an update containing a canceled draft.
    editor?.setEditable(editable, false);
  }, [editor, editable]);

  // Bring in external content changes without causing flicker on blur
  useEffect(() => {
    if (!editor) return;

    // If the editor currently has pending changes, don't stomp what the user is typing
    if (editable && editTimer.current) {
      return;
    }

    // Compare current doc vs incoming doc; if same, skip
    const current = editor.getHTML();

    if (current === content) return;

    syncingRef.current = true;

    editor.commands.setContent(content, { emitUpdate: false });

    const { ui } = appStoreApi.getState().state;

    if (typeof ui.field.metadata?.from !== "undefined") {
      editor.commands.setTextSelection({
        from: ui.field.metadata.from,
        to: ui.field.metadata.to,
      });
    }

    syncingRef.current = false;
  }, [content, editor, appStoreApi, editable]);

  return editor;
}
