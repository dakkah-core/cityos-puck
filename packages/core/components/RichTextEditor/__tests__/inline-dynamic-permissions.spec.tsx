import { act, render, screen, waitFor } from "@testing-library/react";
import { appStoreContext, createAppStore, defaultAppState } from "../../../store";
import { walkAppState } from "../../../lib/data/walk-app-state";
import { getRichTextTransform } from "../../../lib/field-transforms/default-transforms/rich-text-transform";
import type { Config } from "../../../types";

let mockChange: (value: string) => void;
jest.mock("../../../lib/overlay-portal", () => ({ registerOverlayPortal: () => () => undefined }));
jest.mock("../components/Editor", () => ({
  Editor: ({ onChange }: { onChange: (value: string) => void }) => {
    mockChange = onChange;
    return <div>Inline editor</div>;
  },
}));
jest.mock("../components/Render", () => ({ RichTextRender: () => <div>Read only</div> }));

it("commits an allowed inline draft after asynchronous candidate permissions resolve", async () => {
  let release!: () => void;
  let started!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const evaluating = new Promise<void>((resolve) => { started = resolve; });
  const config: Config = { components: { Example: {
    fields: { body: { type: "richtext", contentEditable: true } },
    render: () => <div />,
    resolveData: async (data) => data,
    resolvePermissions: async (data) => {
      if (data.props.body === "new") { started(); await pending; }
      return { edit: true };
    },
  } } };
  const store = createAppStore();
  store.setState({ config, state: walkAppState({ ...defaultAppState,
    data: { ...defaultAppState.data, content: [{ type: "Example", props: { id: "one", body: "saved" } }] },
  }, config) });
  const item = store.getState().state.indexes.nodes.one.data;
  await store.getState().permissions.resolvePermissions({ item });
  const transform = getRichTextTransform().richtext!;
  render(<appStoreContext.Provider value={store}>{transform({
    value: "saved", componentId: "one", propPath: "body",
    field: { type: "richtext", contentEditable: true }, isReadOnly: false,
  } as any)}</appStoreContext.Provider>);
  await screen.findByText("Inline editor");
  act(() => mockChange("new"));
  await act(async () => { await evaluating; });
  await act(async () => { release(); });
  await waitFor(() => expect(store.getState().state.indexes.nodes.one.data.props.body).toBe("new"));
});
