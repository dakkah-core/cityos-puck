import { act, render, screen } from "@testing-library/react";
import { createStore } from "zustand";
import { appStoreContext, createAppStore } from "../../../store";
import { AutoFieldPrivate } from "..";
import { fieldContextStore } from "../store";

describe("root custom-field permissions", () => {
  it("exposes root edit permission through editorContext", () => {
    const store = createAppStore();
    store.setState({
      config: { components: {}, root: { permissions: { edit: false } } },
      selectedItem: null,
    });
    const fieldStore = createStore<Record<string, any>>(() => ({ title: "a" }));
    render(
      <appStoreContext.Provider value={store}>
        <fieldContextStore.ctx.Provider value={fieldStore}>
          <AutoFieldPrivate
            id="title"
            name="title"
            field={{
              type: "custom",
              render: ({ editorContext }) => (
                <span>{editorContext?.canEdit ? "editable" : "read-only"}</span>
              ),
            }}
            onChange={() => {}}
          />
        </fieldContextStore.ctx.Provider>
      </appStoreContext.Provider>,
    );
    expect(screen.getByText("read-only")).toBeTruthy();
    act(() => {
      store.setState({
        config: { components: {}, root: { permissions: { edit: true } } },
      });
    });
    expect(screen.getByText("editable")).toBeTruthy();
  });
});
