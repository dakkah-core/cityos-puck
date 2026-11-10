import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createStore } from "zustand";
import { createAppStore, appStoreContext, AppStore } from "../../../../../store";
import { ObjectField } from "../../../../AutoField/fields/ObjectField";
import { ArrayField } from "../../../../AutoField/fields/ArrayField";
import { fieldContextStore } from "../../../../AutoField/store";
import { walkAppState } from "../../../../../lib/data/walk-app-state";
import { rootDroppableId } from "../../../../../lib/root-droppable-id";
import { Fields } from "..";
import {
  createOnChange,
  getPendingFieldValue,
  withArrayFieldChange,
  withArrayItemChange,
  withObjectFieldChange,
} from "../on-change";

const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const setup = () => {
  const store = createAppStore();
  const first = { type: "Example", props: { id: "one", a: "a0", b: "b0" } };
  const second = { type: "Example", props: { id: "two", a: "a0", b: "b0" } };
  const root = { props: { title: "root", a: "a0", b: "b0" } };
  const config = {
    components: {
      Example: { render: () => <div /> },
      Other: { render: () => <div /> },
    },
  };
  const original = store.getState().state;
  const state = walkAppState(
    {
      ...original,
      data: {
        ...original.data,
        root,
        content: [first, second],
      },
      ui: { ...original.ui, itemSelector: { zone: rootDroppableId, index: 0 } },
    },
    config,
  );
  store.setState({ config, state, selectedItem: state.indexes.nodes.one.data });
  const gate = deferred();
  let calls = 0;
  const resolver = jest.fn((data: any) => {
    calls++;
    if (calls === 1) {
      return gate.promise.then(() => ({ node: data, didChange: true }));
    }
    return Promise.resolve({ node: data, didChange: true });
  });
  store.setState({
    resolveComponentData: resolver as AppStore["resolveComponentData"],
  });
  return { store, gate, resolver };
};

describe("Fields asynchronous edits", () => {
  it.each(["item", "root"])(
    "releases a canceled hanging %s array change and guards stale positions",
    async (target) => {
      const { store, gate, resolver } = setup();
      const previous = store.getState();
      const original = [{ title: "a" }, { title: "b" }];
      const shifted = original.slice(1);
      const parent = {
        ...previous.state.data.content[0],
        props: { ...previous.state.data.content[0].props, items: original },
      };
      const state = walkAppState(
        {
          ...previous.state,
          data: { ...previous.state.data, content: [parent], root: { props: { items: original } } },
          ui: { ...previous.state.ui, itemSelector: target === "root" ? null : previous.state.ui.itemSelector },
        },
        previous.config,
      );
      store.setState({ state, selectedItem: target === "root" ? null : state.indexes.nodes.one.data });
      const canceled = jest.fn();
      const change = createOnChange("items", store, canceled);
      let first!: Promise<void>;
      withArrayFieldChange(store, "items", (items) => items.slice(1), () => {
        first = change(shifted);
      }, original);
      await waitFor(() => expect(resolver).toHaveBeenCalledTimes(1));
      const global = store.getState().permissions.globalPermissions;
      store.setState({ permissions: { ...store.getState().permissions, globalPermissions: { ...global, edit: false } } });
      expect(canceled).toHaveBeenCalledTimes(1);
      store.setState({ permissions: { ...store.getState().permissions, globalPermissions: global } });

      let stale!: Promise<void>;
      withArrayItemChange(store, "items", shifted, "items[0].title", "wrong", () => {
        stale = change([{ title: "wrong" }]);
      });
      await expect(stale).rejects.toThrow("earlier array change failed");

      let retry!: Promise<void>;
      withArrayItemChange(store, "items", original, "items[0].title", "updated", () => {
        retry = change([{ title: "updated" }, original[1]]);
      });
      await retry;
      expect(store.getState().getCurrentData().props?.items).toEqual([
        { title: "updated" },
        { title: "b" },
      ]);
      gate.resolve();
      await first;
      expect(store.getState().getCurrentData().props?.items[0].title).toBe("updated");
    },
  );

  it.each([
    ["item", "canceled"],
    ["item", "failed"],
    ["root", "canceled"],
    ["root", "failed"],
  ])("restores a %s object after an edit %s so the exact value can be retried", async (target, outcome) => {
    const { store, gate, resolver } = setup();
    const previous = store.getState();
    const settings = { a: "original" };
    const fields = {
      settings: {
        type: "object" as const,
        objectFields: {
          a: {
            type: "custom" as const,
            render: ({ value, onChange }: any) => (
              <div>
                <span data-testid="object-value">{value}</span>
                <button type="button" onClick={() => onChange("draft")}>Apply draft</button>
              </div>
            ),
          },
        },
      },
    };
    const config = {
      ...previous.config,
      components: { ...previous.config.components, Example: { render: () => <div />, fields } },
      root: { fields },
    };
    const parent = {
      ...previous.state.data.content[0],
      props: { ...previous.state.data.content[0].props, settings },
    };
    const state = walkAppState(
      {
        ...previous.state,
        data: { ...previous.state.data, content: [parent], root: { props: { settings } } },
        ui: { ...previous.state.ui, itemSelector: target === "root" ? null : previous.state.ui.itemSelector },
      },
      config,
    );
    store.setState({ config, state, selectedItem: target === "root" ? null : state.indexes.nodes.one.data });
    const view = render(<appStoreContext.Provider value={store}><Fields /></appStoreContext.Provider>);
    const button = await screen.findByRole("button", { name: "Apply draft" });
    fireEvent.click(button);
    await waitFor(() => expect(resolver).toHaveBeenCalledTimes(1));
    if (outcome === "canceled") {
      const global = store.getState().permissions.globalPermissions;
      act(() => {
        store.setState({ permissions: { ...store.getState().permissions, globalPermissions: { ...global, edit: false } } });
        store.setState({ permissions: { ...store.getState().permissions, globalPermissions: global } });
      });
    } else {
      await act(async () => { gate.reject(new Error("edit failed")); });
    }
    await waitFor(() => expect(screen.getByTestId("object-value").textContent).toBe("original"));
    expect(store.getState().getCurrentData().props?.settings).toEqual(settings);
    fireEvent.click(button);
    await waitFor(() => expect(store.getState().getCurrentData().props?.settings).toEqual({ a: "draft" }));
    expect(resolver).toHaveBeenCalledTimes(2);
    if (outcome === "canceled") await act(async () => { gate.resolve(); });
    expect(store.getState().getCurrentData().props?.settings).toEqual({ a: "draft" });
    view.unmount();
  });

  it("keeps a newer object draft visible when an earlier edit fails", async () => {
    const { store, gate } = setup();
    const laterGate = deferred();
    const previous = store.getState();
    const settings = { a: "original" };
    const fields = {
      settings: {
        type: "object" as const,
        objectFields: {
          a: {
            type: "custom" as const,
            render: ({ value, onChange }: any) => (
              <div>
                <span data-testid="draft-value">{value}</span>
                <button type="button" onClick={() => onChange("first")}>First draft</button>
                <button type="button" onClick={() => onChange("later")}>Later draft</button>
              </div>
            ),
          },
        },
      },
    };
    const config = {
      ...previous.config,
      components: { ...previous.config.components, Example: { render: () => <div />, fields } },
    };
    const parent = {
      ...previous.state.data.content[0],
      props: { ...previous.state.data.content[0].props, settings },
    };
    const state = walkAppState(
      { ...previous.state, data: { ...previous.state.data, content: [parent] } },
      config,
    );
    const resolver = jest.fn((data: any) =>
      (data.props.settings.a === "first" ? gate.promise : laterGate.promise)
        .then(() => ({ node: data, didChange: true })),
    );
    store.setState({ config, state, selectedItem: state.indexes.nodes.one.data, resolveComponentData: resolver as AppStore["resolveComponentData"] });
    const view = render(<appStoreContext.Provider value={store}><Fields /></appStoreContext.Provider>);
    fireEvent.click(await screen.findByRole("button", { name: "First draft" }));
    await waitFor(() => expect(resolver).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Later draft" }));
    await act(async () => { gate.reject(new Error("first failed")); });
    await waitFor(() => expect(resolver).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("draft-value").textContent).toBe("later");
    await act(async () => { laterGate.resolve(); });
    await waitFor(() => expect(store.getState().getCurrentData().props?.settings).toEqual({ a: "later" }));
    view.unmount();
  });

  it("shows a translated cancellation immediately after selection unmounts the field", async () => {
    const { store, gate, resolver } = setup();
    const previous = store.getState();
    store.setState({
      config: {
        ...previous.config,
        components: {
          ...previous.config.components,
          Example: { render: () => <div />, fields: { a: { type: "text", label: "A" } } },
        },
        root: { fields: {} },
      },
      dictionary: {
        "field-edit-canceled": "Cancelado {field} en {target}",
        "field-edit-dismiss": "Cerrar",
      },
    });
    const view = render(<appStoreContext.Provider value={store}><Fields /></appStoreContext.Provider>);
    fireEvent.change(await screen.findByRole("textbox", { name: "A" }), { target: { value: "draft" } });
    await waitFor(() => expect(resolver).toHaveBeenCalled());
    act(() => {
      store.getState().setUi({ itemSelector: null });
      const permissions = store.getState().permissions;
      store.setState({ permissions: { ...permissions, globalPermissions: { ...permissions.globalPermissions, edit: false } } });
    });
    expect(screen.getByRole("alert").textContent).toContain("Cancelado a en Example (one)");
    expect(screen.queryByRole("textbox", { name: "A" })).toBeNull();
    await act(async () => { gate.reject(new Error("resolver failed after cancellation")); });
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("alert")).toBeNull();
    view.unmount();
  });

  it("retains a translated resolver failure while the Fields panel is unmounted", async () => {
    const { store, gate, resolver } = setup();
    const previous = store.getState();
    store.setState({
      config: {
        ...previous.config,
        components: {
          ...previous.config.components,
          Example: { render: () => <div />, fields: { a: { type: "text", label: "A" } } },
        },
      },
      dictionary: { "field-edit-failed": "Falló {field} en {target}" },
    });
    const panel = () => <appStoreContext.Provider value={store}><Fields /></appStoreContext.Provider>;
    const view = render(panel());
    fireEvent.change(await screen.findByRole("textbox", { name: "A" }), { target: { value: "draft" } });
    await waitFor(() => expect(resolver).toHaveBeenCalled());
    view.unmount();
    await act(async () => { gate.reject(new Error("resolver failed")); });
    const remounted = render(panel());
    expect(screen.getByRole("alert").textContent).toContain("Falló a en Example (one)");
    remounted.unmount();
  });

  it.each(["item", "root"])("does not resolve a %s edit when current permission is denied", async (target) => {
    const { store, resolver } = setup();
    const previous = store.getState();
    const decide = jest.fn((item: any) => ({ edit: item.props.a === "grant" }));
    const config = {
      ...previous.config,
      components: { ...previous.config.components, Example: { render: () => <div />, resolvePermissions: decide } },
      root: { resolvePermissions: decide },
    };
    store.setState({ config });
    if (target === "root") store.getState().setUi({ itemSelector: null });
    const canceled = jest.fn();
    await createOnChange("a", store, canceled)("grant");
    expect(resolver).not.toHaveBeenCalled();
    expect(canceled).toHaveBeenCalledTimes(1);
    expect(decide).toHaveBeenCalledWith(expect.objectContaining({ props: expect.objectContaining({ a: "a0" }) }), expect.anything());
  });

  it.each(["item", "root"])("checks the resolved %s candidate rather than the committed permission", async (target) => {
    const { store } = setup();
    const previous = store.getState();
    const decide = jest.fn((item: any) => ({ edit: item.props.a !== "denied" }));
    const config = {
      ...previous.config,
      components: { ...previous.config.components, Example: { render: () => <div />, resolvePermissions: decide } },
      root: { resolvePermissions: decide },
    };
    store.setState({
      config,
      resolveComponentData: (async (item: any) => ({ node: { ...item, props: { ...item.props, a: "denied" } }, didChange: true })) as AppStore["resolveComponentData"],
    });
    if (target === "root") store.getState().setUi({ itemSelector: null });
    const canceled = jest.fn();
    await createOnChange("a", store, canceled)("allowed input");
    expect(canceled).toHaveBeenCalledTimes(1);
    expect(store.getState().getCurrentData().props?.a).toBe("a0");
    expect(decide).toHaveBeenCalledWith(expect.objectContaining({ type: target === "root" ? "root" : "Example", props: expect.objectContaining({ a: "denied" }) }), expect.anything());
  });

  it.each(["item", "root"])("cancels %s decisions if app state changes while candidate permission resolves", async (target) => {
    const { store, gate } = setup();
    const candidateGate = deferred();
    const previous = store.getState();
    const decide = jest.fn(async (item: any) => {
      if (item.props.a === "candidate") await candidateGate.promise;
      return { edit: true };
    });
    const config = {
      ...previous.config,
      components: { ...previous.config.components, Example: { render: () => <div />, resolvePermissions: decide } },
      root: { resolvePermissions: decide },
    };
    store.setState({ config });
    if (target === "root") store.getState().setUi({ itemSelector: null });
    gate.resolve();
    const canceled = jest.fn();
    const pending = createOnChange("a", store, canceled)("candidate");
    await waitFor(() => expect(decide).toHaveBeenCalledWith(expect.objectContaining({ props: expect.objectContaining({ a: "candidate" }) }), expect.anything()));
    store.getState().setUi({ itemSelector: { zone: rootDroppableId, index: target === "root" ? 0 : 1 } });
    expect(canceled).toHaveBeenCalledTimes(1);
    candidateGate.resolve();
    await pending;
    expect(canceled).toHaveBeenCalledTimes(1);
    expect(target === "root" ? store.getState().state.data.root.props?.a : store.getState().state.indexes.nodes.one.data.props.a).toBe("a0");
  });

  it.each(["item", "root"])("does not bind a superseded %s candidate to a current denial", async (target) => {
    const { store, gate } = setup();
    const candidateGate = deferred();
    const previous = store.getState();
    let currentAllowed = true;
    const decide = jest.fn(async (item: any) => {
      if (item.props.a === "candidate") {
        await candidateGate.promise;
        return { edit: true };
      }
      return { edit: currentAllowed };
    });
    const config = {
      ...previous.config,
      components: { ...previous.config.components, Example: { render: () => <div />, resolvePermissions: decide } },
      root: { resolvePermissions: decide },
    };
    store.setState({ config });
    if (target === "root") store.getState().setUi({ itemSelector: null });
    gate.resolve();
    const canceled = jest.fn();
    const pending = createOnChange("a", store, canceled)("candidate");
    await waitFor(() => expect(decide).toHaveBeenCalledWith(expect.objectContaining({ props: expect.objectContaining({ a: "candidate" }) }), expect.anything()));
    currentAllowed = false;
    await store.getState().permissions.refreshPermissions(target === "root" ? { root: true } : { item: store.getState().state.indexes.nodes.one.data });
    candidateGate.resolve();
    await pending;
    expect(canceled).toHaveBeenCalledTimes(1);
    expect(store.getState().getCurrentData().props?.a).toBe("a0");
  });

  it.each(["item", "root"])("reports queued %s drafts canceled by a transient revocation", async (target) => {
    const { store, gate, resolver } = setup();
    if (target === "root") store.getState().setUi({ itemSelector: null });
    const canceled = jest.fn();
    const first = createOnChange("a", store, canceled)("first");
    const second = createOnChange("b", store, canceled)("second");
    await waitFor(() => expect(resolver).toHaveBeenCalled());
    const permissions = store.getState().permissions;
    store.setState({ permissions: { ...permissions, globalPermissions: { ...permissions.globalPermissions, edit: false } } });
    expect(canceled).toHaveBeenCalledTimes(2);
    store.setState({ permissions: { ...store.getState().permissions, globalPermissions: permissions.globalPermissions } });
    gate.resolve();
    await Promise.all([first, second]);
    expect(canceled).toHaveBeenCalledTimes(2);
    expect(store.getState().getCurrentData().props).toMatchObject({ a: "a0", b: "b0" });
  });

  it.each(["item", "root"])("accepts a new %s edit while a canceled resolver is still pending", async (target) => {
    const { store, gate, resolver } = setup();
    if (target === "root") store.getState().setUi({ itemSelector: null });
    const canceled = jest.fn();
    const old = createOnChange("a", store, canceled)("old draft");
    await waitFor(() => expect(resolver).toHaveBeenCalled());
    const permissions = store.getState().permissions;
    store.setState({ permissions: { ...permissions, globalPermissions: { ...permissions.globalPermissions, edit: false } } });
    expect(canceled).toHaveBeenCalledTimes(1);
    store.setState({ permissions: { ...store.getState().permissions, globalPermissions: permissions.globalPermissions } });
    await createOnChange("b", store)("new draft");
    expect(store.getState().getCurrentData().props?.b).toBe("new draft");
    gate.resolve();
    await old;
    expect(store.getState().getCurrentData().props).toMatchObject({ a: "a0", b: "new draft" });
  });

  it("checks a legacy root candidate using normalized root props", async () => {
    const { store } = setup();
    const previous = store.getState();
    const decide = jest.fn((item: any) => ({ edit: item.props.title !== "denied" }));
    const config = { ...previous.config, root: { resolvePermissions: decide } };
    const state = walkAppState({ ...previous.state, data: { ...previous.state.data, root: { title: "old" } }, ui: { ...previous.state.ui, itemSelector: null } }, config);
    store.setState({ state: { ...state, data: { ...state.data, root: { title: "old" } } }, config, selectedItem: null });
    const canceled = jest.fn();
    await createOnChange("title", store, canceled)("denied");
    expect(canceled).toHaveBeenCalledTimes(1);
    expect(store.getState().state.data.root.title).toBe("old");
    expect(decide).toHaveBeenCalledWith(expect.objectContaining({ type: "root", props: expect.objectContaining({ id: "root", title: "denied" }) }), expect.anything());
  });

  it.each([
    ["item", "delete"],
    ["item", "duplicate"],
    ["item", "reorder"],
    ["item", "edit"],
    ["root", "delete"],
    ["root", "duplicate"],
    ["root", "reorder"],
    ["root", "edit"],
  ])(
    "rejects a %s array %s after an earlier structural change fails",
    async (target, action) => {
      const { store, gate, resolver } = setup();
      const previous = store.getState();
      const original = [{ title: "a" }, { title: "b" }, { title: "c" }];
      const shifted = original.slice(1);
      const parent = {
        ...previous.state.data.content[0],
        props: { ...previous.state.data.content[0].props, items: original },
      };
      const state = walkAppState(
        {
          ...previous.state,
          data: { ...previous.state.data, content: [parent], root: { props: { items: original } } },
          ui: { ...previous.state.ui, itemSelector: target === "root" ? null : previous.state.ui.itemSelector },
        },
        previous.config,
      );
      store.setState({ state, selectedItem: target === "root" ? null : state.indexes.nodes.one.data });
      const change = createOnChange("items", store);
      let first!: Promise<void>;
      let later!: Promise<void>;
      withArrayFieldChange(store, "items", (items) => items.slice(1), () => {
        first = change(shifted);
      }, original);
      const firstFailure = expect(first).rejects.toThrow("structural failure");

      if (action === "edit") {
        // Match ObjectField's innermost change followed by the enclosing array handler.
        withObjectFieldChange(store, "items[0].title", "edited", () => {
          withArrayItemChange(store, "items", shifted, "items[0].title", "edited", () => {
            later = change([{ title: "edited" }, shifted[1]]);
          });
        });
      } else {
        const update = (items: typeof original) => {
          if (action === "delete") return items.slice(1);
          if (action === "duplicate") return [items[0], ...items];
          return [items[1], items[0]];
        };
        withArrayFieldChange(store, "items", update, () => {
          later = change(update(shifted));
        }, shifted);
      }
      const laterFailure = expect(later).rejects.toThrow("earlier array change failed");
      await waitFor(() => expect(resolver).toHaveBeenCalled());
      gate.reject(new Error("structural failure"));
      await Promise.all([firstFailure, laterFailure]);
      const result = target === "root"
        ? store.getState().state.data.root.props?.items
        : store.getState().state.indexes.nodes.one.data.props.items;
      expect(result).toEqual(original);
    },
  );

  it("rejects a stale array position after failure and accepts it after resynchronization", async () => {
    const { store, gate, resolver } = setup();
    const previous = store.getState();
    const original = [{ title: "a" }, { title: "b" }];
    const shifted = original.slice(1);
    const parent = {
      ...previous.state.data.content[0],
      props: { ...previous.state.data.content[0].props, items: original },
    };
    const state = walkAppState(
      { ...previous.state, data: { ...previous.state.data, content: [parent] } },
      previous.config,
    );
    store.setState({ state, selectedItem: state.indexes.nodes.one.data });
    const change = createOnChange("items", store);
    let failed!: Promise<void>;
    withArrayFieldChange(store, "items", (items) => items.slice(1), () => {
      failed = change(shifted);
    }, original);
    const failure = expect(failed).rejects.toThrow("structural failure");
    await waitFor(() => expect(resolver).toHaveBeenCalled());
    gate.reject(new Error("structural failure"));
    await failure;

    let stale!: Promise<void>;
    withArrayItemChange(store, "items", shifted, "items[0].title", "wrong", () => {
      stale = change([{ title: "wrong" }]);
    });
    await expect(stale).rejects.toThrow("earlier array change failed");
    expect(store.getState().state.indexes.nodes.one.data.props.items).toEqual(original);

    let retried!: Promise<void>;
    withArrayItemChange(store, "items", original, "items[0].title", "updated", () => {
      retried = change([{ title: "updated" }, original[1]]);
    });
    await retried;
    expect(store.getState().state.indexes.nodes.one.data.props.items).toEqual([
      { title: "updated" },
      { title: "b" },
    ]);
  });

  it("applies resolved root edit permissions to an array item's fields", async () => {
    const { store } = setup();
    const previous = store.getState();
    const items = [{ title: "root item" }];
    const config = {
      ...previous.config,
      root: { resolvePermissions: () => ({ edit: false }) },
    };
    const state = walkAppState(
      {
        ...previous.state,
        data: { ...previous.state.data, root: { props: { items } } },
        ui: {
          ...previous.state.ui,
          itemSelector: null,
          arrayState: {
            ...previous.state.ui.arrayState,
            items: {
              items: [{ _originalIndex: 0, _currentIndex: 0, _arrayId: "items-0" }],
              openId: "items-0",
            },
          },
        },
      },
      config,
    );
    store.setState({ config, state, selectedItem: null });
    await store.getState().permissions.resolvePermissions({ root: true });
    const fieldStore = createStore<Record<string, any>>(() => ({ items }));
    const view = render(
      <appStoreContext.Provider value={store}>
        <fieldContextStore.ctx.Provider value={fieldStore}>
          <ArrayField
            id="items"
            name="items"
            field={{ type: "array", arrayFields: { title: { type: "text" } } }}
            value={items}
            onChange={() => {}}
            Label={({ children }) => <div>{children}</div>}
          />
        </fieldContextStore.ctx.Provider>
      </appStoreContext.Provider>,
    );
    try {
      expect(screen.getByRole("textbox", { name: "title" })).toHaveAttribute("readonly");
    } finally {
      view.unmount();
    }
  });

  it("replays an array addition without committing an earlier rejected item edit", async () => {
    const { store, gate, resolver } = setup();
    const previous = store.getState();
    const items = [{ title: "old" }];
    const parent = {
      ...previous.state.data.content[0],
      props: { ...previous.state.data.content[0].props, items },
    };
    const state = walkAppState(
      { ...previous.state, data: { ...previous.state.data, content: [parent] } },
      previous.config,
    );
    store.setState({ state, selectedItem: state.indexes.nodes.one.data });
    const change = createOnChange("items", store);
    let failed!: Promise<void>;
    let addition!: Promise<void>;
    withObjectFieldChange(store, "items[0].title", "failed", () => {
      failed = change([{ title: "failed" }]);
    });
    const failure = expect(failed).rejects.toThrow("failed edit");
    withArrayFieldChange(
      store,
      "items",
      (value = []) => [...value, { title: "new" }],
      () => { addition = change([{ title: "failed" }, { title: "new" }]); },
      [{ title: "failed" }],
    );
    await waitFor(() => expect(resolver).toHaveBeenCalled());
    gate.reject(new Error("failed edit"));
    await failure;
    await addition;
    expect(store.getState().state.indexes.nodes.one.data.props.items).toEqual([
      { title: "old" },
      { title: "new" },
    ]);
  });

  it.each(["item", "root"])(
    "keeps a pending %s array item edit when adding an item after a field-store sync",
    async (target) => {
      const { store, gate } = setup();
      const secondGate = deferred();
      const previous = store.getState();
      const items = [{ settings: { a: "a0", b: "b0" } }];
      const parent = {
        ...previous.state.data.content[0],
        props: { ...previous.state.data.content[0].props, items },
      };
      const state = walkAppState(
        {
          ...previous.state,
          data: {
            ...previous.state.data,
            content: [parent],
            root: { props: { items } },
          },
          ui: {
            ...previous.state.ui,
            itemSelector: target === "root" ? null : previous.state.ui.itemSelector,
          },
        },
        previous.config,
      );
      let calls = 0;
      store.setState({
        state,
        selectedItem: target === "root" ? null : state.indexes.nodes.one.data,
        resolveComponentData: ((data: any) => {
          calls++;
          const wait = calls === 1 ? gate.promise : calls === 2 ? secondGate.promise : Promise.resolve();
          return wait.then(() => ({ node: data, didChange: true }));
        }) as AppStore["resolveComponentData"],
      });
      const fieldStore = createStore<Record<string, any>>(() => ({ items }));
      const unsubscribe = store.subscribe(
        (s) => s.getCurrentData().props?.items,
        (value) => fieldStore.setState({ items: value }),
      );
      const change = createOnChange("items", store);
      const view = render(
        <appStoreContext.Provider value={store}>
          <fieldContextStore.ctx.Provider value={fieldStore}>
            <ArrayField
              id="items"
              name="items"
              field={{ type: "array", arrayFields: { settings: { type: "object", objectFields: { a: { type: "text" }, b: { type: "text" } } } } }}
              value={items}
              onChange={change}
              Label={({ children }) => <div>{children}</div>}
            />
          </fieldContextStore.ctx.Provider>
        </appStoreContext.Provider>,
      );
      try {
        let first!: Promise<void>;
        let second!: Promise<void>;
        withObjectFieldChange(store, "items[0].settings.a", "a1", () => {
          first = change([{ settings: { a: "a1", b: "b0" } }]);
        });
        withObjectFieldChange(store, "items[0].settings.b", "b1", () => {
          second = change([{ settings: { a: "a1", b: "b1" } }]);
        });
        await act(async () => { gate.resolve(); await first; });
        await waitFor(() => expect(calls).toBe(2));
        expect(fieldStore.getState().items[0].settings.b).toBe("b0");
        fireEvent.click(screen.getByRole("button", { name: "Add item" }));
        await act(async () => { secondGate.resolve(); await second; });
        await waitFor(() => {
          const result = store.getState().getCurrentData().props?.items;
          expect(result).toHaveLength(2);
          expect(result[0].settings).toEqual({ a: "a1", b: "b1" });
        });
      } finally {
        unsubscribe();
        view.unmount();
      }
    },
  );

  it.each([
    ["item", "current", true],
    ["item", "candidate", true],
    ["root", "current", true],
    ["root", "candidate", true],
    ["item", "current", false],
    ["item", "candidate", false],
    ["root", "current", false],
    ["root", "candidate", false],
  ])(
    "reauthorizes queued %s array drafts after UI changes during %s permission (allow=%s)",
    async (target, phase, allow) => {
      const { store } = setup();
      const previous = store.getState();
      const blocked = deferred();
      let armed = false;
      let paused = false;
      const observedCounts: number[] = [];
      const decisions: Array<{ count: number; length: number }> = [];
      const decide = jest.fn(async (item: any, { appState }: any) => {
        const count = appState.ui.arrayState.items?.items.length ?? 0;
        observedCounts.push(count);
        decisions.push({ count, length: item.props.items.length });
        if (armed && !paused && item.props.items.length === (phase === "current" ? 0 : 1)) {
          paused = true;
          await blocked.promise;
        }
        return {
          edit: allow || count < 2 || (phase === "candidate" && item.props.items.length === 0),
        };
      });
      const config = {
        components: { Example: { render: () => <div />, resolvePermissions: decide } },
        root: { resolvePermissions: decide },
      };
      const items: object[] = [];
      const parent = { type: "Example", props: { id: "one", items } };
      const state = walkAppState(
        {
          ...previous.state,
          data: { ...previous.state.data, content: [parent], root: { props: { items } } },
          ui: { ...previous.state.ui, itemSelector: target === "root" ? null : previous.state.ui.itemSelector },
        },
        config,
      );
      store.setState({
        config,
        state,
        selectedItem: target === "root" ? null : state.indexes.nodes.one.data,
        resolveComponentData: (async (data: any) => ({ node: data, didChange: true })) as AppStore["resolveComponentData"],
      });
      const fieldStore = createStore<Record<string, any>>(() => ({ items }));
      const sync = store.subscribe(
        (s) => s.getCurrentData().props?.items,
        (value) => fieldStore.setState({ items: value }),
      );
      const canceled = jest.fn();
      const change = createOnChange("items", store, canceled);
      const edits: Promise<void>[] = [];
      const view = render(
        <appStoreContext.Provider value={store}>
          <fieldContextStore.ctx.Provider value={fieldStore}>
            <ArrayField
              id="items"
              name="items"
              field={{ type: "array", arrayFields: { title: { type: "text" } } }}
              value={items}
              onChange={(value) => {
                const edit = change(value);
                edits.push(edit);
                void edit.catch(() => {});
              }}
              Label={({ children }) => <div>{children}</div>}
            />
          </fieldContextStore.ctx.Provider>
        </appStoreContext.Provider>,
      );
      // Model another store subscriber issuing a nested notification before
      // the authorization listener sees the original array UI update.
      const nested = store.subscribe((next, before) => {
        if (next.state.ui !== before.state.ui) store.setState({ status: next.status });
      });
      try {
        await store.getState().permissions.resolvePermissions(
          target === "root" ? { root: true } : { item: store.getState().selectedItem },
        );
        armed = true;
        fireEvent.click(screen.getByRole("button", { name: "Add item" }));
        await waitFor(() => expect(paused).toBe(true));
        fireEvent.click(screen.getByRole("button", { name: "Add item" }));
        await waitFor(() => expect(edits).toHaveLength(2));
        await act(async () => { await Promise.allSettled(edits); });
        expect(observedCounts).toContain(2);
        if (phase === "candidate") {
          expect(decisions).toContainEqual({ count: 2, length: 1 });
        }
        expect(store.getState().getCurrentData().props?.items).toHaveLength(allow ? 2 : 0);
        expect(canceled).toHaveBeenCalledTimes(allow ? 0 : 1);
        blocked.resolve();
      } finally {
        blocked.resolve();
        nested();
        sync();
        view.unmount();
      }
    },
  );

  it.each([
    ["item", "during resolution"],
    ["root", "during resolution"],
    ["item", "before resolution"],
    ["root", "before resolution"],
  ])(
    "rebases a %s object leaf edit over a sibling slot change %s",
    async (target, timing) => {
      const { store, gate, resolver } = setup();
      const previous = store.getState();
      const fields = {
        settings: {
          type: "object" as const,
          objectFields: { title: { type: "text" as const }, content: { type: "slot" as const } },
        },
      };
      const config = {
        components: { Example: { render: () => <div />, fields } },
        root: { fields },
      };
      const child = { type: "Example", props: { id: "child", a: "child0" } };
      const settings = { title: "old", content: [child] };
      const parent = { type: "Example", props: { id: "one", settings } };
      const state = walkAppState(
        {
          ...previous.state,
          data: {
            ...previous.state.data,
            content: target === "root" ? [] : [parent],
            root: { props: target === "root" ? { settings } : {} },
          },
          ui: { ...previous.state.ui, itemSelector: target === "root" ? null : { zone: rootDroppableId, index: 0 } },
        },
        config,
      );
      store.setState({ config, state, selectedItem: target === "root" ? null : state.indexes.nodes.one.data });
      const blocker = timing === "before resolution"
        ? createOnChange("other", store)("changed")
        : undefined;
      let edit!: Promise<void>;
      withObjectFieldChange(store, "settings.title", "new", () => {
        edit = createOnChange("settings", store)({ ...settings, title: "new" });
      });
      await waitFor(() => expect(resolver).toHaveBeenCalled());
      store.getState().setUi({ itemSelector: { zone: `${target === "root" ? "root" : "one"}:settings.content`, index: 0 } });
      await createOnChange("a", store)("child1");
      gate.resolve();
      await blocker;
      await edit;
      const result = target === "root"
        ? store.getState().state.data.root.props?.settings
        : store.getState().state.indexes.nodes.one.data.props.settings;
      expect(result.title).toBe("new");
      expect(result.content[0].props.a).toBe("child1");
    },
  );

  it.each(["item", "root"])(
    "does not commit a rejected object sibling through a later %s edit",
    async (target) => {
      const { store, gate, resolver } = setup();
      const current = store.getState();
      const settings = { a: "a0", b: "b0" };
      const first = {
        ...current.state.data.content[0],
        props: { ...current.state.data.content[0].props, settings },
      };
      const state = walkAppState(
        {
          ...current.state,
          data: {
            ...current.state.data,
            content: [first, current.state.data.content[1]],
            root: { props: { ...current.state.data.root.props, settings } },
          },
          ui: {
            ...current.state.ui,
            itemSelector: target === "root" ? null : current.state.ui.itemSelector,
          },
        },
        current.config,
      );
      store.setState({
        state,
        selectedItem: target === "root" ? null : state.indexes.nodes.one.data,
      });
      const fieldStore = createStore<Record<string, any>>(() => ({ settings }));
      const unsubscribe = store.subscribe(
        (s) => s.getCurrentData().props?.settings,
        (value) => fieldStore.setState({ settings: value }),
      );
      const change = createOnChange("settings", store);
      const calls: Promise<void>[] = [];
      const view = render(
        <appStoreContext.Provider value={store}>
          <fieldContextStore.ctx.Provider value={fieldStore}>
            <ObjectField
              id="settings"
              name="settings"
              field={{
                type: "object",
                objectFields: { a: { type: "text" }, b: { type: "text" } },
              }}
              value={settings}
              onChange={(value, ui) => {
                const call = change(value, ui);
                calls.push(call);
                void call.catch(() => {});
              }}
              Label={({ children }) => <div>{children}</div>}
            />
          </fieldContextStore.ctx.Provider>
        </appStoreContext.Provider>,
      );
      try {
        fireEvent.change(screen.getByRole("textbox", { name: "a" }), {
          target: { value: "a1" },
        });
        fireEvent.change(screen.getByRole("textbox", { name: "b" }), {
          target: { value: "b1" },
        });
        expect(calls).toHaveLength(2);
        const firstFailure = expect(calls[0]).rejects.toThrow("failed edit");
        await act(async () => {
          await waitFor(() => expect(resolver).toHaveBeenCalled());
          gate.reject(new Error("failed edit"));
          await Promise.allSettled(calls);
        });
        await firstFailure;
        expect(store.getState().getCurrentData().props?.settings).toEqual({
          a: "a0",
          b: "b1",
        });
      } finally {
        unsubscribe();
        view.unmount();
      }
    },
  );

  it("keeps object sibling edits through an intermediate React field-store sync", async () => {
    const { store, gate } = setup();
    const secondGate = deferred();
    const current = store.getState();
    const settings = { a: "a0", b: "b0", c: "c0" };
    const first = { ...current.state.data.content[0], props: { ...current.state.data.content[0].props, settings } };
    const state = walkAppState(
      { ...current.state, data: { ...current.state.data, content: [first, current.state.data.content[1]] } },
      current.config,
    );
    let calls = 0;
    store.setState({
      state,
      selectedItem: state.indexes.nodes.one.data,
      resolveComponentData: ((data: any) => {
        calls++;
        const wait = calls === 1 ? gate.promise : calls === 2 ? secondGate.promise : Promise.resolve();
        return wait.then(() => ({ node: data, didChange: true }));
      }) as AppStore["resolveComponentData"],
    });
    const fieldStore = createStore<Record<string, any>>(() => ({ settings }));
    const unsubscribe = store.subscribe(
      (s) => s.state.indexes.nodes.one.data.props.settings,
      (value) => fieldStore.setState({ settings: value }),
    );
    const view = render(
      <appStoreContext.Provider value={store}>
        <fieldContextStore.ctx.Provider value={fieldStore}>
          <ObjectField
            id="settings"
            name="settings"
            field={{ type: "object", objectFields: { a: { type: "text" }, b: { type: "text" }, c: { type: "text" } } }}
            value={settings}
            onChange={createOnChange("settings", store)}
            Label={({ children }) => <div>{children}</div>}
          />
        </fieldContextStore.ctx.Provider>
      </appStoreContext.Provider>,
    );
    try {
      fireEvent.change(screen.getByRole("textbox", { name: "a" }), { target: { value: "a1" } });
      fireEvent.change(screen.getByRole("textbox", { name: "b" }), { target: { value: "b1" } });
      await act(async () => { gate.resolve(); });
      await waitFor(() => expect(calls).toBe(2));
      expect(fieldStore.getState().settings).toEqual({ a: "a1", b: "b0", c: "c0" });
      fireEvent.change(screen.getByRole("textbox", { name: "c" }), { target: { value: "c1" } });
      await act(async () => { secondGate.resolve(); });
      await waitFor(() => expect(store.getState().state.indexes.nodes.one.data.props.settings).toEqual({ a: "a1", b: "b1", c: "c1" }));
    } finally {
      unsubscribe();
      view.unmount();
    }
  });

  it("retries a parent edit against a child edit committed during resolution", async () => {
    const { store, gate, resolver } = setup();
    const previous = store.getState();
    const config = {
      components: {
        Example: { render: () => <div />, fields: { children: { type: "slot" as const } } },
      },
    };
    const parent = { type: "Example", props: { id: "one", a: "parent0", children: [{ type: "Example", props: { id: "child", a: "child0" } }] } };
    const state = walkAppState(
      { ...previous.state, data: { ...previous.state.data, content: [parent] } },
      config,
    );
    store.setState({ config, state, selectedItem: state.indexes.nodes.one.data });
    const parentEdit = createOnChange("a", store)("parent1");
    await waitFor(() => expect(resolver).toHaveBeenCalled());
    store.getState().setUi({ itemSelector: { zone: "one:children", index: 0 } });
    await createOnChange("a", store)("child1");
    gate.resolve();
    await parentEdit;
    expect(resolver).toHaveBeenCalledTimes(3);
    const result = store.getState().state.indexes.nodes.one.data;
    expect(result.props.a).toBe("parent1");
    expect(result.props.children[0].props.a).toBe("child1");
  });

  it("retries a root edit against a child edit in a root slot", async () => {
    const { store, gate, resolver } = setup();
    const previous = store.getState();
    const config = {
      ...previous.config,
      root: { fields: { children: { type: "slot" as const } } },
    };
    const state = walkAppState(
      {
        ...previous.state,
        data: {
          ...previous.state.data,
          root: { props: { title: "root0", children: [{ type: "Example", props: { id: "child", a: "child0" } }] } },
        },
        ui: { ...previous.state.ui, itemSelector: null },
      },
      config,
    );
    store.setState({ config, state, selectedItem: null });
    const rootEdit = createOnChange("title", store)("root1");
    await waitFor(() => expect(resolver).toHaveBeenCalled());
    store.getState().setUi({ itemSelector: { zone: "root:children", index: 0 } });
    await createOnChange("a", store)("child1");
    gate.resolve();
    await rootEdit;
    expect(resolver).toHaveBeenCalledTimes(3);
    expect(store.getState().state.data.root.props).toMatchObject({
      title: "root1",
      children: [{ props: { id: "child", a: "child1" } }],
    });
  });

  it("preserves a child in a slot nested inside an object and array", async () => {
    const { store, gate, resolver } = setup();
    const previous = store.getState();
    const config = {
      components: {
        Example: {
          render: () => <div />,
          fields: {
            layout: {
              type: "object" as const,
              objectFields: {
                items: {
                  type: "array" as const,
                  arrayFields: { children: { type: "slot" as const } },
                },
              },
            },
          },
        },
      },
    };
    const parent = {
      type: "Example",
      props: {
        id: "one",
        a: "parent0",
        layout: {
          items: [{ children: [{ type: "Example", props: { id: "child", a: "child0" } }] }],
        },
      },
    };
    const state = walkAppState(
      { ...previous.state, data: { ...previous.state.data, content: [parent] } },
      config,
    );
    store.setState({ config, state, selectedItem: state.indexes.nodes.one.data });
    const pending = createOnChange("a", store)("parent1");
    await waitFor(() => expect(resolver).toHaveBeenCalled());
    store.getState().setUi({
      itemSelector: { zone: "one:layout.items[0].children", index: 0 },
    });
    await createOnChange("a", store)("child1");
    gate.resolve();
    await pending;
    const result = store.getState().state.indexes.nodes.one.data.props;
    expect(result.a).toBe("parent1");
    expect(result.layout.items[0].children[0].props.a).toBe("child1");
  });

  it("does not overwrite an observed child change with a stale edit to its slot", async () => {
    const { store, gate, resolver } = setup();
    const previous = store.getState();
    const config = {
      components: {
        Example: { render: () => <div />, fields: { children: { type: "slot" as const } } },
      },
    };
    const child = { type: "Example", props: { id: "child", a: "child0" } };
    const parent = { type: "Example", props: { id: "one", children: [child] } };
    const state = walkAppState(
      { ...previous.state, data: { ...previous.state.data, content: [parent] } },
      config,
    );
    store.setState({ config, state, selectedItem: state.indexes.nodes.one.data });
    const parentEdit = createOnChange("children", store)([{ ...child, props: { ...child.props, a: "stale" } }]);
    await waitFor(() => expect(resolver).toHaveBeenCalled());
    store.getState().setUi({ itemSelector: { zone: "one:children", index: 0 } });
    await createOnChange("a", store)("child1");
    store.getState().setUi({ itemSelector: { zone: rootDroppableId, index: 0 } });
    expect(getPendingFieldValue(store, "children")).toBeUndefined();
    gate.resolve();
    await parentEdit;
    expect(store.getState().state.indexes.nodes.one.data.props.children[0].props.a).toBe("child1");
  });

  it("does not replay an object patch that replaces a slot changed during resolution", async () => {
    const { store, gate, resolver } = setup();
    const previous = store.getState();
    const config = {
      components: {
        Example: {
          render: () => <div />,
          fields: {
            settings: {
              type: "object" as const,
              objectFields: { content: { type: "slot" as const } },
            },
          },
        },
      },
    };
    const child = { type: "Example", props: { id: "child", a: "child0" } };
    const parent = { type: "Example", props: { id: "one", settings: { content: [child] } } };
    const state = walkAppState(
      { ...previous.state, data: { ...previous.state.data, content: [parent] } },
      config,
    );
    store.setState({ config, state, selectedItem: state.indexes.nodes.one.data });
    const stale = [{ ...child, props: { ...child.props, a: "stale" } }];
    let edit!: Promise<void>;
    withObjectFieldChange(store, "settings.content", stale, () => {
      edit = createOnChange("settings", store)({ content: stale });
    });
    await waitFor(() => expect(resolver).toHaveBeenCalled());
    store.getState().setUi({ itemSelector: { zone: "one:settings.content", index: 0 } });
    await createOnChange("a", store)("child1");
    gate.resolve();
    await edit;
    expect(store.getState().state.indexes.nodes.one.data.props.settings.content[0].props.a).toBe("child1");
  });

  it("does not replay a queued slot edit over a child change observed before it starts", async () => {
    const { store, gate, resolver } = setup();
    const previous = store.getState();
    const config = {
      components: {
        Example: { render: () => <div />, fields: { children: { type: "slot" as const } } },
      },
    };
    const child = { type: "Example", props: { id: "child", a: "child0" } };
    const parent = { type: "Example", props: { id: "one", a: "parent0", children: [child] } };
    const state = walkAppState(
      { ...previous.state, data: { ...previous.state.data, content: [parent] } },
      config,
    );
    store.setState({ config, state, selectedItem: state.indexes.nodes.one.data });
    const first = createOnChange("a", store)("parent1");
    const stale = createOnChange("children", store)([{ ...child, props: { ...child.props, a: "stale" } }]);
    await waitFor(() => expect(resolver).toHaveBeenCalled());
    store.getState().setUi({ itemSelector: { zone: "one:children", index: 0 } });
    await createOnChange("a", store)("child1");
    gate.resolve();
    await Promise.all([first, stale]);
    const result = store.getState().state.indexes.nodes.one.data;
    expect(result.props.a).toBe("parent1");
    expect(result.props.children[0].props.a).toBe("child1");
  });

  it("drops a pending edit after an external change to the target itself", async () => {
    const { store, gate, resolver } = setup();
    const pending = createOnChange("a", store)("pending");
    await waitFor(() => expect(resolver).toHaveBeenCalled());
    const current = store.getState().state.indexes.nodes.one.data;
    store.getState().dispatch({
      type: "replace",
      destinationZone: rootDroppableId,
      destinationIndex: 0,
      data: { ...current, props: { ...current.props, b: "external" } },
    });
    gate.resolve();
    await pending;
    expect(store.getState().state.indexes.nodes.one.data.props).toMatchObject({
      a: "a0",
      b: "external",
    });
  });

  it("commits same-field edits in input order", async () => {
    const { store, gate, resolver } = setup();
    const change = createOnChange("a", store);
    const first = change("old");
    const second = change("new");
    await waitFor(() => expect(resolver).toHaveBeenCalled());
    expect(resolver).toHaveBeenCalledTimes(1);
    gate.resolve();
    await Promise.all([first, second]);
    expect(store.getState().state.indexes.nodes.one.data.props.a).toBe("new");
  });

  it("resolves distinct fields against the preceding committed edit", async () => {
    const { store, gate, resolver } = setup();
    const first = createOnChange("a", store)("a1");
    const second = createOnChange("b", store)("b1");
    await waitFor(() => expect(resolver).toHaveBeenCalled());
    gate.resolve();
    await Promise.all([first, second]);
    expect(resolver.mock.calls[1][0].props).toMatchObject({ a: "a1", b: "b1" });
    expect(store.getState().state.indexes.nodes.one.data.props).toMatchObject({
      a: "a1",
      b: "b1",
    });
  });

  it("does not block another item while one item is resolving", async () => {
    const { store, gate, resolver } = setup();
    const first = createOnChange("a", store)("one");
    await waitFor(() => expect(resolver).toHaveBeenCalled());
    store.getState().setUi({
      itemSelector: { zone: rootDroppableId, index: 1 },
    });
    await createOnChange("a", store)("two");
    expect(store.getState().state.indexes.nodes.two.data.props.a).toBe("two");
    gate.resolve();
    await first;
    expect(store.getState().state.indexes.nodes.one.data.props.a).toBe("one");
  });

  it("does not block the root while an item is resolving", async () => {
    const { store, gate, resolver } = setup();
    const itemEdit = createOnChange("a", store)("item");
    await waitFor(() => expect(resolver).toHaveBeenCalled());
    store.getState().setUi({ itemSelector: null });
    await createOnChange("a", store)("root");
    expect(store.getState().state.data.root.props).toMatchObject({ a: "root" });
    gate.resolve();
    await itemEdit;
    expect(store.getState().state.indexes.nodes.one.data.props.a).toBe("item");
  });

  it("drops an old item edit after removal and ID reuse", async () => {
    const { store, gate, resolver } = setup();
    const old = createOnChange("a", store)("old");
    await waitFor(() => expect(resolver).toHaveBeenCalled());
    store.getState().dispatch({
      type: "remove",
      zone: rootDroppableId,
      index: 0,
    });
    const state = store.getState().state;
    const replacement = { type: "Example", props: { id: "one", a: "replacement" } };
    store.setState({
      state: walkAppState(
        {
          ...state,
          data: { ...state.data, content: [replacement, ...state.data.content] },
          ui: { ...state.ui, itemSelector: { zone: rootDroppableId, index: 0 } },
        },
        store.getState().config,
      ),
    });
    store.setState({ selectedItem: store.getState().state.indexes.nodes.one.data });
    await createOnChange("a", store)("new lifetime");
    gate.resolve();
    await old;
    expect(store.getState().state.indexes.nodes.one.data.props.a).toBe(
      "new lifetime",
    );
  });

  it("drops an old item edit after a same-ID type replacement", async () => {
    const { store, gate, resolver } = setup();
    const old = createOnChange("a", store)("old");
    await waitFor(() => expect(resolver).toHaveBeenCalled());
    store.getState().dispatch({
      type: "replace",
      destinationZone: rootDroppableId,
      destinationIndex: 0,
      data: { type: "Other", props: { id: "one", a: "replacement" } },
    });
    gate.resolve();
    await old;
    expect(store.getState().state.indexes.nodes.one.data).toMatchObject({
      type: "Other",
      props: { a: "replacement" },
    });
  });

  it("orders root fields and discards work after an external root replacement", async () => {
    const { store, gate, resolver } = setup();
    store.getState().setUi({ itemSelector: null });
    const first = createOnChange("a", store)("a1");
    const second = createOnChange("b", store)("b1");
    await waitFor(() => expect(resolver).toHaveBeenCalled());
    gate.resolve();
    await Promise.all([first, second]);
    expect(store.getState().state.data.root.props).toMatchObject({ a: "a1", b: "b1" });

    const next = deferred();
    const nextResolver = jest.fn((data: any) =>
        next.promise.then(() => ({
          node: data,
          didChange: true,
        })));
    store.setState({
      resolveComponentData: nextResolver as AppStore["resolveComponentData"],
    });
    const stale = createOnChange("a", store)("stale");
    await waitFor(() => expect(nextResolver).toHaveBeenCalled());
    store.getState().dispatch({
      type: "replaceRoot",
      root: { props: { title: "external" } },
    });
    next.resolve();
    await stale;
    expect(store.getState().state.data.root.props?.title).toBe("external");
  });

  it("continues later edits after a resolver failure", async () => {
    const { store, gate, resolver } = setup();
    const first = createOnChange("a", store)("failed");
    const rejection = expect(first).rejects.toThrow("failed");
    const second = createOnChange("b", store)("b1");
    await waitFor(() => expect(resolver).toHaveBeenCalled());
    gate.reject(new Error("failed"));
    await rejection;
    await second;
    expect(store.getState().state.indexes.nodes.one.data.props).toMatchObject({
      a: "a0",
      b: "b1",
    });
  });
});
