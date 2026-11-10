import { act, renderHook } from "@testing-library/react";
import { useEditor } from "@tiptap/react";
import { useSyncedEditor } from "../lib/use-synced-editor";

jest.mock("@tiptap/react", () => ({ useEditor: jest.fn() }));
jest.mock("../../../store", () => {
  const store = {
    getState: () => ({ state: { ui: { field: { focus: "body" } } } }),
  };
  return { useAppStoreApi: () => store };
});

describe("rich text draft cancellation", () => {
  let html: string;
  let update: (event: { editor: any }) => void;
  let editor: any;

  beforeEach(() => {
    jest.useFakeTimers();
    html = "<p>saved</p>";
    editor = {
      getHTML: () => html,
      state: { selection: { from: 1, to: 1 } },
      commands: {
        setContent: jest.fn((content) => { html = content; }),
        setTextSelection: jest.fn(),
      },
      setEditable: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
    };
    jest.mocked(useEditor).mockImplementation((options: any) => {
      update = options.onUpdate;
      return editor;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("discards a trailing draft on read-only and allows the same edit after access returns", () => {
    const onChange = jest.fn();
    const extensions: any[] = [];
    const { rerender } = renderHook(
      ({ editable, content }) => useSyncedEditor({
        content, editable, onChange, extensions, name: "body",
      }),
      { initialProps: { editable: true, content: "<p>saved</p>" } },
    );

    act(() => {
      html = "<p>first</p>";
      update({ editor });
      html = "<p>draft</p>";
      update({ editor });
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    rerender({ editable: false, content: "<p>first</p>" });
    expect(html).toBe("<p>first</p>");
    expect(editor.setEditable).toHaveBeenLastCalledWith(false, false);
    rerender({ editable: true, content: "<p>first</p>" });
    expect(editor.setEditable).toHaveBeenLastCalledWith(true, false);
    act(() => { jest.advanceTimersByTime(250); });
    expect(onChange).toHaveBeenCalledTimes(1);

    act(() => {
      html = "<p>draft</p>";
      update({ editor });
    });
    expect(onChange).toHaveBeenLastCalledWith("<p>draft</p>", expect.anything());
  });

  it("cancels a trailing draft on unmount", () => {
    const onChange = jest.fn();
    const { unmount } = renderHook(() => useSyncedEditor({
      content: "<p>saved</p>", onChange, extensions: [], name: "body",
    }));
    act(() => {
      html = "<p>first</p>";
      update({ editor });
      html = "<p>draft</p>";
      update({ editor });
    });
    unmount();
    act(() => { jest.advanceTimersByTime(250); });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("does not publish updates while read-only or replay a draft on callback changes", () => {
    const first = jest.fn();
    const second = jest.fn();
    const extensions: any[] = [];
    const { rerender } = renderHook(
      ({ editable, onChange }) => useSyncedEditor({
        content: "<p>saved</p>", editable, onChange, extensions, name: "body",
      }),
      { initialProps: { editable: true, onChange: first } },
    );
    act(() => {
      html = "<p>first</p>";
      update({ editor });
    });
    rerender({ editable: false, onChange: second });
    act(() => {
      html = "<p>ignored</p>";
      update({ editor });
      jest.advanceTimersByTime(250);
    });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });
});
