import { render, screen, waitFor } from "@testing-library/react";
import { getRichTextTransform } from "../../../lib/field-transforms/default-transforms/rich-text-transform";
import { resolveAndReplaceInlineData } from "../../../lib/data/resolve-and-replace-data";
import { dismissFieldEdit, getFieldEditAlerts } from "../../Puck/components/Fields/edit-alerts";

let mockState: any;
let mockChange: (value: string) => void;
let mockFocus: (editor: any) => void;
const mockStore = { getState: () => mockState, setState: (change: any) => { mockState = { ...mockState, ...change }; } };

jest.mock("../../../store", () => ({
  useAppStoreApi: () => mockStore,
  useAppStore: (selector: (state: any) => unknown) => selector(mockState),
}));
jest.mock("../../../lib/overlay-portal", () => ({
  registerOverlayPortal: () => () => undefined,
}));
jest.mock("../../../lib/data/resolve-and-replace-data", () => ({
  resolveAndReplaceInlineData: jest.fn(() => Promise.resolve(true)),
}));
jest.mock("../components/Editor", () => ({
  Editor: ({ onChange, onFocus }: any) => {
    mockChange = onChange;
    mockFocus = onFocus;
    return <div>Inline editor</div>;
  },
}));
jest.mock("../components/Render", () => ({
  RichTextRender: () => <div>Read only</div>,
}));

describe("inline rich text permissions", () => {
  beforeEach(() => {
    for (const alert of getFieldEditAlerts(mockStore as any)) dismissFieldEdit(mockStore as any, alert.id);
    mockState = {
      state: { indexes: { nodes: { one: { data: {
        type: "Example", props: { id: "one", items: [{ body: "saved" }] },
      } } } } },
      permissions: { getPermissions: () => ({ edit: true }) },
    };
    jest.clearAllMocks();
  });

  it.each(["path", "wildcard", "permission", "removed"])(
    "rejects a stale callback after %s access changes",
    async (change) => {
      const transform = getRichTextTransform().richtext!;
      render(transform({
        value: "saved", componentId: "one", propPath: "items[0].body",
        field: { type: "richtext", contentEditable: true }, isReadOnly: false,
      } as any));
      await screen.findByText("Inline editor");
      mockChange("allowed");
      expect(resolveAndReplaceInlineData).toHaveBeenCalledTimes(1);
      jest.mocked(resolveAndReplaceInlineData).mockClear();

      const node = mockState.state.indexes.nodes.one;
      if (change === "path") node.data.readOnly = { "items[0].body": true };
      if (change === "wildcard") node.data.readOnly = { "items[*].body": true };
      if (change === "permission") mockState.permissions.getPermissions = () => ({ edit: false });
      if (change === "removed") delete mockState.state.indexes.nodes.one;
      mockChange("stale");
      expect(resolveAndReplaceInlineData).not.toHaveBeenCalled();
    },
  );

  it("keeps an in-flight edit canceled after access is revoked and restored", async () => {
    const transform = getRichTextTransform().richtext!;
    const renderField = () => transform({
      value: "saved", componentId: "one", propPath: "items[0].body",
      field: { type: "richtext", contentEditable: true }, isReadOnly: false,
    } as any);
    const { rerender } = render(renderField());
    await screen.findByText("Inline editor");
    mockChange("draft");
    const mayCommit = jest.mocked(resolveAndReplaceInlineData).mock.calls[0]![4];
    expect(mayCommit()).toBe(true);

    mockState.permissions.getPermissions = () => ({ edit: false });
    rerender(renderField());
    expect(mayCommit()).toBe(false);
    mockState.permissions.getPermissions = () => ({ edit: true });
    rerender(renderField());
    expect(mayCommit()).toBe(false);
  });

  it("restores the current saved field after a canceled latest edit", async () => {
    jest.mocked(resolveAndReplaceInlineData).mockResolvedValueOnce(false);
    const transform = getRichTextTransform().richtext!;
    render(transform({
      value: "saved", componentId: "one", propPath: "items[0].body",
      field: { type: "richtext", contentEditable: true }, isReadOnly: false,
    } as any));
    await screen.findByText("Inline editor");
    const editor = { isDestroyed: false, commands: { setContent: jest.fn() } };
    mockFocus(editor);
    mockChange("canceled draft");
    await waitFor(() => expect(editor.commands.setContent).toHaveBeenCalledWith("saved", { emitUpdate: false }));
    expect(getFieldEditAlerts(mockStore as any)).toEqual([expect.objectContaining({
      field: "items[0].body", target: { kind: "item", id: "one", type: "Example" }, reason: "canceled",
    })]);
  });

  it("restores a canceled edit after focus moves elsewhere", async () => {
    jest.mocked(resolveAndReplaceInlineData).mockResolvedValueOnce(false);
    const transform = getRichTextTransform().richtext!;
    render(transform({
      value: "saved", componentId: "one", propPath: "items[0].body",
      field: { type: "richtext", contentEditable: true }, isReadOnly: false,
    } as any));
    await screen.findByText("Inline editor");
    const editor = { isDestroyed: false, commands: { setContent: jest.fn() } };
    mockFocus(editor);
    mockChange("canceled draft");
    mockState.currentRichText = { editor: { commands: { setContent: jest.fn() } } };
    await waitFor(() => expect(editor.commands.setContent).toHaveBeenCalledWith("saved", { emitUpdate: false }));
  });

  it("does not restore an old edit into a replacement editor", async () => {
    jest.mocked(resolveAndReplaceInlineData).mockResolvedValueOnce(false);
    const transform = getRichTextTransform().richtext!;
    render(transform({
      value: "saved", componentId: "one", propPath: "items[0].body",
      field: { type: "richtext", contentEditable: true }, isReadOnly: false,
    } as any));
    await screen.findByText("Inline editor");
    const original = { isDestroyed: false, commands: { setContent: jest.fn() } };
    const replacement = { isDestroyed: false, commands: { setContent: jest.fn() } };
    mockFocus(original);
    mockChange("canceled draft");
    mockFocus(replacement);
    await waitFor(() => expect(resolveAndReplaceInlineData).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(original.commands.setContent).not.toHaveBeenCalled();
    expect(replacement.commands.setContent).not.toHaveBeenCalled();
  });
});
