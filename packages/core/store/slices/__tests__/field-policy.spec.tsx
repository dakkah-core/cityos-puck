import { act, renderHook, waitFor } from "@testing-library/react";
import { createAppStore, defaultAppState } from "../..";
import { useRegisterFieldsSlice } from "../fields";
import { FieldPolicyRefreshSupersededError } from "../field-policy";
import { walkAppState } from "../../../lib/data/walk-app-state";
import type { Config } from "../../../types";
import { createOnChange } from "../../../components/Puck/components/Fields/on-change";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function setup(config: Config) {
  const store = createAppStore();
  const state = walkAppState({
    ...defaultAppState,
    data: {
      root: { props: { title: "root" } },
      content: [{ type: "Box", props: { id: "box", title: "before", children: [
        { type: "Box", props: { id: "child", title: "nested", children: [] } },
      ] } }],
      zones: {},
    },
    ui: { ...defaultAppState.ui, itemSelector: { index: 0 } },
  }, config);
  store.setState({ config, state, selectedItem: state.indexes.nodes.box.data });
  return store;
}

describe("host field policy refresh", () => {
  it("restarts a superseded selected-field refresh after navigation", async () => {
    const slow = deferred<any>();
    let held = false;
    const config: Config = { components: { Box: {
      render: () => <div />,
      fields: { title: { type: "text" }, children: { type: "slot" } },
      resolveData: (data: any) => {
        if (data.props.id === "box" && !held) { held = true; return slow.promise; }
        return { readOnly: undefined };
      },
    } } };
    const store = setup(config);
    const { rerender } = renderHook(
      ({ id }: { id: string }) => useRegisterFieldsSlice(store, id),
      { initialProps: { id: "box" } },
    );
    await waitFor(() => expect(store.getState().fields.id).toBe("box"));

    const superseded = store.getState().refreshFieldPolicy();
    const rejected = expect(superseded).rejects.toBeInstanceOf(FieldPolicyRefreshSupersededError);
    store.setState({ selectedItem: store.getState().state.indexes.nodes.child.data });
    rerender({ id: "child" });

    await waitFor(() => expect(store.getState().fields.policyPending).toBe(false));
    expect(store.getState().fields.id).toBe("child");
    slow.resolve({ readOnly: undefined });
    await rejected;
  });

  it("refreshes root, nested nodes and selected fields without writing props or history", async () => {
    let locked = false;
    const resolveData = jest.fn((data: any) => ({
      props: { ...data.props, title: "resolver output must not be saved" },
      readOnly: locked ? { title: true, children: true } : {},
    }));
    const config: Config = {
      root: { fields: { title: { type: "text" } }, resolveData },
      components: { Box: {
        render: () => <div />,
        fields: { title: { type: "text" }, children: { type: "slot" } },
        resolveData,
        resolveFields: (_data, { fields }) => ({ ...fields, title: { type: "text", label: locked ? "Locked" : "Open" } }),
      } },
    };
    const store = setup(config);
    renderHook(() => useRegisterFieldsSlice(store, "box"));
    await waitFor(() => expect(store.getState().fields.fields.title?.label).toBe("Open"));
    const history = store.getState().history;
    locked = true;
    await act(async () => { await store.getState().refreshFieldPolicy(); });
    expect(store.getState().state.data.root.readOnly?.title).toBe(true);
    expect(store.getState().state.indexes.nodes.child.data.readOnly?.children).toBe(true);
    expect(store.getState().selectedItem?.readOnly?.title).toBe(true);
    expect(store.getState().selectedItem?.props.title).toBe("before");
    expect(store.getState().fields.fields.title?.label).toBe("Locked");
    expect(store.getState().history).toBe(history);
    locked = false;
    await act(async () => { await store.getState().refreshFieldPolicy(); });
    expect(store.getState().state.data.root.readOnly?.title).toBeUndefined();
    expect(store.getState().state.indexes.nodes.child.data.readOnly?.title).toBeUndefined();
    expect(store.getState().fields.fields.title?.label).toBe("Open");
  });

  it("retries against a concurrent content edit and preserves its history", async () => {
    const slow = deferred<any>();
    let held = false;
    const config: Config = { components: { Box: {
      render: () => <div />,
      fields: { title: { type: "text" }, children: { type: "slot" } },
      resolveData: (data: any) => {
        if (data.props.id === "box" && !held) { held = true; return slow.promise; }
        return { readOnly: { title: data.props.title === "edited" } };
      },
    } } };
    const store = setup(config);
    const pending = store.getState().refreshFieldPolicy();
    store.getState().dispatch({ type: "replace", data: { ...store.getState().selectedItem!, props: { ...store.getState().selectedItem!.props, title: "edited" } }, destinationZone: "root:default-zone", destinationIndex: 0 });
    const history = store.getState().history;
    slow.resolve({ props: { title: "stale" }, readOnly: { title: false } });
    await pending;
    expect(store.getState().selectedItem?.props.title).toBe("edited");
    expect(store.getState().selectedItem?.readOnly?.title).toBe(true);
    expect(store.getState().history).toBe(history);
  });

  it("rejects an older policy refresh and ignores its late result", async () => {
    const slow = deferred<any>();
    let call = 0;
    const config: Config = { components: { Box: {
      render: () => <div />,
      fields: { title: { type: "text" }, children: { type: "slot" } },
      resolveData: (data: any) => data.props.id === "box" && call++ === 0
        ? slow.promise : { readOnly: { title: true } },
    } } };
    const store = setup(config);
    const old = store.getState().refreshFieldPolicy();
    const rejected = expect(old).rejects.toBeInstanceOf(FieldPolicyRefreshSupersededError);
    await store.getState().refreshFieldPolicy();
    slow.resolve({ readOnly: { title: false } });
    await rejected;
    expect(store.getState().selectedItem?.readOnly?.title).toBe(true);
  });

  it("keeps editing and slot operations denied after rejection until a retry succeeds", async () => {
    let fail = true;
    const config: Config = { components: { Box: {
      render: () => <div />,
      fields: { title: { type: "text" }, children: { type: "slot" } },
      resolveData: () => {
        if (fail) throw new Error("policy unavailable");
        return { readOnly: { children: true } };
      },
    } } };
    const store = setup(config);
    const history = store.getState().history;
    const data = store.getState().state.data;
    await expect(store.getState().refreshFieldPolicy()).rejects.toThrow("policy unavailable");
    expect(store.getState().fields.policyPending).toBe(true);
    expect(store.getState().permissions.getPermissions({ item: store.getState().selectedItem }).edit).toBe(false);
    expect(store.getState().permissions.getPermissions({ root: true }).insert).toBe(false);
    const canceled = jest.fn();
    await createOnChange("title", store, canceled)("unauthorized");
    expect(store.getState().state.data).toBe(data);
    expect(store.getState().history).toBe(history);
    fail = false;
    await store.getState().refreshFieldPolicy();
    expect(store.getState().fields.policyPending).toBe(false);
    expect(store.getState().permissions.getPermissions({ item: store.getState().selectedItem }).edit).toBe(true);
    expect(store.getState().selectedItem?.readOnly?.children).toBe(true);
    expect(store.getState().selectedItem?.props.title).toBe("before");
    expect(store.getState().history).toBe(history);
  });

  it("keeps the gate closed when an older refresh settles while a newer one is pending", async () => {
    const first = deferred<any>();
    const second = deferred<any>();
    let call = 0;
    const config: Config = { components: { Box: {
      render: () => <div />,
      fields: { title: { type: "text" }, children: { type: "slot" } },
      resolveData: (data: any) => data.props.id === "box"
        ? (++call === 1 ? first.promise : second.promise)
        : { readOnly: {} },
    } } };
    const store = setup(config);
    const old = store.getState().refreshFieldPolicy();
    const rejected = expect(old).rejects.toBeInstanceOf(FieldPolicyRefreshSupersededError);
    const current = store.getState().refreshFieldPolicy();
    first.resolve({ readOnly: {} });
    await rejected;
    expect(store.getState().permissions.getPermissions({ root: true }).insert).toBe(false);
    expect(store.getState().permissions.getPermissions({ item: store.getState().selectedItem }).edit).toBe(false);
    second.resolve({ readOnly: { children: true } });
    await current;
    expect(store.getState().fields.policyPending).toBe(false);
    expect(store.getState().selectedItem?.readOnly?.children).toBe(true);
  });

  it("keeps the gate closed when selected resolveFields rejects", async () => {
    let fail = false;
    const config: Config = { components: { Box: {
      render: () => <div />,
      fields: { title: { type: "text" }, children: { type: "slot" } },
      resolveFields: (_data, { fields }) => {
        if (fail) throw new Error("fields unavailable");
        return fields;
      },
    } } };
    const store = setup(config);
    renderHook(() => useRegisterFieldsSlice(store, "box"));
    await waitFor(() => expect(store.getState().fields.id).toBe("box"));
    fail = true;
    await act(async () => {
      await expect(store.getState().refreshFieldPolicy()).rejects.toThrow("fields unavailable");
    });
    expect(store.getState().fields.policyPending).toBe(true);
    expect(store.getState().permissions.getPermissions({ root: true }).insert).toBe(false);
    fail = false;
    await act(async () => { await store.getState().refreshFieldPolicy(); });
    expect(store.getState().fields.policyPending).toBe(false);
  });

  it("re-evaluates a history navigation that occurs during refresh", async () => {
    const slow = deferred<any>();
    let held = false;
    const config: Config = { components: { Box: {
      render: () => <div />,
      fields: { title: { type: "text" }, children: { type: "slot" } },
      resolveData: (data: any) => {
        if (data.props.id === "box" && !held) { held = true; return slow.promise; }
        return { readOnly: { title: data.props.title === "before" } };
      },
    } } };
    const store = setup(config);
    const previous = store.getState().state;
    store.getState().dispatch({ type: "replace", data: { ...store.getState().selectedItem!, props: { ...store.getState().selectedItem!.props, title: "later" } }, destinationZone: "root:default-zone", destinationIndex: 0, recordHistory: false });
    const later = store.getState().state;
    store.getState().history.setHistories([{ id: "one", state: previous }, { id: "two", state: later }]);
    const pending = store.getState().refreshFieldPolicy();
    store.getState().history.back();
    slow.resolve({ readOnly: { title: false } });
    await pending;
    expect(store.getState().selectedItem?.props.title).toBe("before");
    expect(store.getState().selectedItem?.readOnly?.title).toBe(true);
    expect(store.getState().history.index).toBe(0);
    expect(store.getState().history.histories).toHaveLength(2);
  });

  it("discards a selected resolveFields result started under the old policy", async () => {
    const slow = deferred<any>();
    let locked = false;
    const config: Config = { components: { Box: {
      render: () => <div />,
      fields: { title: { type: "text" }, children: { type: "slot" } },
      resolveFields: (_data, { fields }) => locked
        ? { ...fields, title: { type: "text", label: "New" } }
        : slow.promise,
    } } };
    const store = setup(config);
    renderHook(() => useRegisterFieldsSlice(store, "box"));
    locked = true;
    await act(async () => { await store.getState().refreshFieldPolicy(); });
    await act(async () => { slow.resolve({ title: { type: "text", label: "Old" } }); await slow.promise; });
    expect(store.getState().fields.fields.title?.label).toBe("New");
  });
});
