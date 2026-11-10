import { render, screen } from "@testing-library/react";
import { getRichTextTransform } from "../../../lib/field-transforms/default-transforms/rich-text-transform";
import { resolveAndReplaceData } from "../../../lib/data/resolve-and-replace-data";

let mockState: any;
let mockChange: (value: string) => void;
const mockStore = { getState: () => mockState };

jest.mock("../../../store", () => ({
  useAppStoreApi: () => mockStore,
  useAppStore: (selector: (state: any) => unknown) => selector(mockState),
}));
jest.mock("../../../lib/overlay-portal", () => ({
  registerOverlayPortal: () => () => undefined,
}));
jest.mock("../../../lib/data/resolve-and-replace-data", () => ({
  resolveAndReplaceData: jest.fn(() => Promise.resolve()),
}));
jest.mock("../components/Editor", () => ({
  Editor: ({ onChange }: any) => {
    mockChange = onChange;
    return <div>Inline editor</div>;
  },
}));
jest.mock("../components/Render", () => ({
  RichTextRender: () => <div>Read only</div>,
}));

describe("inline rich text permissions", () => {
  beforeEach(() => {
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
      expect(resolveAndReplaceData).toHaveBeenCalledTimes(1);
      jest.mocked(resolveAndReplaceData).mockClear();

      const node = mockState.state.indexes.nodes.one;
      if (change === "path") node.data.readOnly = { "items[0].body": true };
      if (change === "wildcard") node.data.readOnly = { "items[*].body": true };
      if (change === "permission") mockState.permissions.getPermissions = () => ({ edit: false });
      if (change === "removed") delete mockState.state.indexes.nodes.one;
      mockChange("stale");
      expect(resolveAndReplaceData).not.toHaveBeenCalled();
    },
  );
});
