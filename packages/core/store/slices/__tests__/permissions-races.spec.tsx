import { act, renderHook, waitFor } from "@testing-library/react";
import { createAppStore, defaultAppState } from "../../";
import { ComponentData, Config, Permissions } from "../../../types";
import { PermissionResolutionSupersededError, useRegisterPermissionsSlice } from "../permissions";
import { walkAppState } from "../../../lib/data/walk-app-state";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const item = (id: string, value = "a") => ({
  type: "Example",
  props: { id, value },
});

function subject(
  resolver: (
    data: Omit<ComponentData, "type">,
  ) => Partial<Permissions> | Promise<Partial<Permissions>>,
) {
  const store = createAppStore();
  store.setState({
    config: {
      components: {
        Example: { render: () => <div />, resolvePermissions: resolver },
      },
    },
  });
  return store;
}

const resolveItem = async (
  store: ReturnType<typeof createAppStore>,
  data: ComponentData,
) => {
  await store.getState().permissions.resolvePermissions({ item: data });
};

const refreshItem = async (
  store: ReturnType<typeof createAppStore>,
  data: ComponentData,
) => {
  await store.getState().permissions.refreshPermissions({ item: data });
};

const refreshRoot = async (store: ReturnType<typeof createAppStore>) => {
  await store.getState().permissions.refreshPermissions({ root: true });
};

describe("permission resolution concurrency", () => {
  it("fails closed for unregistered candidate types, including indexed nodes", async () => {
    const store = subject(async () => ({ edit: true }));
    const config = store.getState().config;
    store.setState({ state: walkAppState({
      ...defaultAppState,
      data: { ...defaultAppState.data, content: [item("one")] },
    }, config) });
    const indexed = store.getState().state.indexes.nodes.one.data;
    store.setState({ config: { components: {} } });
    expect(await store.getState().permissions.resolveCandidatePermissions(indexed)).toBeUndefined();
    expect(await store.getState().permissions.resolveCandidatePermissions(item("new"))).toBeUndefined();
  });

  it("allows candidate checks for the optional default root configuration", async () => {
    const store = createAppStore();
    const config = store.getState().config;
    store.setState({ state: walkAppState(defaultAppState, config) });
    const root = store.getState().state.indexes.nodes.root.data;
    const decision = await store.getState().permissions.resolveCandidatePermissions(root);
    expect(decision?.permissions.edit).toBe(true);
    expect(decision?.isCurrent()).toBe(true);
  });

  it("invalidates an existing candidate decision if its type is removed in place", async () => {
    const store = subject(async () => ({ edit: true }));
    const decision = await store.getState().permissions.resolveCandidatePermissions(item("new"));
    expect(decision?.isCurrent()).toBe(true);
    delete store.getState().config.components.Example;
    expect(decision?.isCurrent()).toBe(false);
  });

  it.each(["item", "root"])("retains the %s candidate refresh query without displacing the committed grant", async (scope) => {
    const store = createAppStore();
    const config: Config = {
      components: { Example: { render: () => <div />, resolvePermissions: async (data) => ({ edit: data.props.value !== "denied" }) } },
      root: { resolvePermissions: async (data) => ({ edit: data.props?.value !== "denied" }) },
    };
    store.setState({ config, state: walkAppState({
      ...defaultAppState,
      data: { ...defaultAppState.data, content: [item("one")] },
    }, config) });
    const committed = store.getState().state.indexes.nodes[scope === "root" ? "root" : "one"].data;
    await resolveItem(store, committed);
    const oldEntry = store.getState().permissions.cache[committed.props.id];
    const proposed = { ...committed, props: { ...committed.props, value: "denied" } };
    await refreshItem(store, proposed);

    const permissions = store.getState().permissions;
    expect(permissions.cache[committed.props.id]).toBe(oldEntry);
    expect(permissions.getPermissions({ item: committed }).edit).toBe(true);
    expect(permissions.getPermissions({ item: { ...proposed, props: { ...proposed.props } } }).edit).toBe(false);
    const allowed = { ...committed, props: { ...committed.props, value: "allowed" } };
    await refreshItem(store, allowed);
    expect(store.getState().permissions.getPermissions({ item: allowed }).edit).toBe(true);
    await refreshItem(store, committed);
    expect(store.getState().permissions.getPermissions({ item: allowed }).edit).toBe(false);
  });

  it("resolves permissions for an inserted child during proposed root data resolution", async () => {
    const store = createAppStore();
    const child = item("new-child");
    const config: Config = {
      components: { Example: {
        render: () => <div />,
        resolveData: async (data) => data,
        resolvePermissions: async () => ({ edit: true }),
      } },
      root: {
        fields: { children: { type: "slot" as const } },
        resolveData: async (data) => data,
        resolvePermissions: async () => ({ edit: true }),
      },
    };
    store.setState({ config, state: walkAppState(defaultAppState, config) });
    const root = store.getState().state.indexes.nodes.root.data;
    await resolveItem(store, root);
    const childDecision = await store.getState().permissions.resolveCandidatePermissions(child);
    expect(childDecision?.permissions.edit).toBe(true);
    expect(childDecision?.isCurrent()).toBe(true);
    const proposed = { ...root, props: { ...root.props, children: [child] } };
    await store.getState().resolveComponentData(proposed, "replace");

    expect(store.getState().state.indexes.nodes[child.props.id]).toBeUndefined();
    expect(store.getState().permissions.getPermissions({ item: child }).edit).toBe(true);
    expect(store.getState().permissions.getPermissions({ item: root }).edit).toBe(true);
  });

  it("keeps candidate decisions separate and invalidates a decision after a current-item refresh", async () => {
    const store = subject(async () => ({ edit: true }));
    const config = store.getState().config;
    const current = item("one");
    store.setState({
      state: walkAppState({
        ...defaultAppState,
        data: { ...defaultAppState.data, content: [current] },
      }, config),
    });
    const committed = store.getState().state.indexes.nodes.one.data;
    await resolveItem(store, committed);
    const originalEntry = store.getState().permissions.cache.one;
    const proposed = item("one", "draft");
    const result = await store.getState().permissions.resolveCandidatePermissions(proposed);

    expect(result?.permissions.edit).toBe(true);
    expect(result?.isCurrent()).toBe(true);
    expect(store.getState().permissions.cache.one).toBe(originalEntry);
    expect(store.getState().permissions.getPermissions({ item: committed }).edit).toBe(true);
    await refreshItem(store, committed);
    expect(result?.isCurrent()).toBe(false);
  });

  it("rejects a candidate when a reentrant refresh supersedes its permission inputs", async () => {
    let store: ReturnType<typeof createAppStore>;
    let reentered = false;
    store = subject(async (data) => {
      if (data.props.value === "draft" && !reentered) {
        reentered = true;
        const committed = store.getState().state.indexes.nodes.one.data;
        await store.getState().permissions.refreshPermissions({ item: committed });
      }
      return { edit: true };
    });
    const config = store.getState().config;
    store.setState({
      state: walkAppState({
        ...defaultAppState,
        data: { ...defaultAppState.data, content: [item("one")] },
      }, config),
    });
    await resolveItem(store, store.getState().state.indexes.nodes.one.data);
    expect(await store.getState().permissions.resolveCandidatePermissions(item("one", "draft"))).toBeUndefined();
  });

  it("preserves a reentrant loading update when a superseded request cleans up", async () => {
    jest.useFakeTimers();
    const old = deferred<Partial<Permissions>>();
    const store = subject(jest.fn().mockReturnValue(old.promise));
    const current = item("one");
    const first = refreshItem(store, current);
    const rejection = expect(first).rejects.toBeInstanceOf(PermissionResolutionSupersededError);
    jest.advanceTimersByTime(50);
    expect(store.getState().componentState.one.loadingCount).toBe(1);

    let updated = false;
    const unsubscribe = store.subscribe((state, previous) => {
      if (!updated && state.pendingLoadTimeouts !== previous.pendingLoadTimeouts &&
          Object.keys(state.pendingLoadTimeouts).length === 0) {
        updated = true;
        store.setState({
          componentState: {
            ...state.componentState,
            one: { ...state.componentState.one, loadingCount: 2 },
          },
        });
      }
    });
    try {
      store.setState({ config: { components: {} } });
      await rejection;
      // Let the canceled request's deferred cleanup run without waiting for
      // the obsolete resolver.
      await Promise.resolve();
      expect(updated).toBe(true);
      expect(store.getState().componentState.one.loadingCount).toBe(1);
      old.resolve({ edit: true });
      await old.promise;
    } finally {
      unsubscribe();
      jest.useRealTimers();
    }
  });

  it("supersedes a decision when cleanup synchronously starts a refresh", async () => {
    const firstDecision = deferred<Partial<Permissions>>();
    const secondDecision = deferred<Partial<Permissions>>();
    const store = subject(
      jest.fn().mockReturnValueOnce(firstDecision.promise).mockReturnValueOnce(secondDecision.promise),
    );
    const current = item("one");
    let second: Promise<void> | undefined;
    const unsubscribe = store.subscribe((state, previous) => {
      if (!second && state.pendingLoadTimeouts !== previous.pendingLoadTimeouts &&
          Object.keys(state.pendingLoadTimeouts).length === 0) {
        // Mark reentry before refresh registers its own loading timeout.
        second = Promise.resolve();
        second = refreshItem(store, current);
      }
    });
    try {
      const first = refreshItem(store, current);
      const rejection = expect(first).rejects.toBeInstanceOf(PermissionResolutionSupersededError);
      firstDecision.resolve({ edit: true });
      await rejection;
      expect(second).toBeDefined();
      expect(store.getState().permissions.getPermissions({ item: current }).edit).toBe(false);
      secondDecision.resolve({ edit: false });
      await second;
      expect(store.getState().permissions.getPermissions({ item: current }).edit).toBe(false);
    } finally {
      unsubscribe();
    }
  });

  it.each(["resolve", "refresh"])("coalesces synchronous %s reentry during loading registration", async (mode) => {
    const pending = deferred<Partial<Permissions>>();
    const resolver = jest.fn().mockReturnValue(pending.promise);
    const store = subject(resolver);
    const current = item("one");
    const nested: Promise<void>[] = [];
    const unsubscribe = store.subscribe((state, previous) => {
      if (
        state.pendingLoadTimeouts !== previous.pendingLoadTimeouts &&
        Object.keys(state.pendingLoadTimeouts).length > 0
      ) {
        nested.push(mode === "refresh" ? refreshItem(store, current) : resolveItem(store, current));
      }
    });
    try {
      const initial = resolveItem(store, current);
      expect(resolver).toHaveBeenCalledTimes(1);
      expect(nested).toHaveLength(1);
      pending.resolve({ edit: true });
      await Promise.all([initial, ...nested]);
      expect(store.getState().permissions.getPermissions({ item: current }).edit).toBe(true);
    } finally {
      unsubscribe();
    }
  });

  it("runs a new forced decision after synchronous resolver reentry", async () => {
    let allowed = true;
    let nested: Promise<void> | undefined;
    const fresh = deferred<Partial<Permissions>>();
    const current = item("one");
    let store: ReturnType<typeof createAppStore>;
    const resolver = jest.fn(() => {
      const captured = allowed;
      if (!nested) {
        allowed = false;
        nested = refreshItem(store, current);
        return { edit: captured };
      }
      return fresh.promise;
    });
    store = subject(resolver);
    const initial = refreshItem(store, current);
    const initialRejection = expect(initial).rejects.toBeInstanceOf(PermissionResolutionSupersededError);
    expect(nested).toBeDefined();
    await initialRejection;
    expect(resolver).toHaveBeenCalledTimes(2);
    expect(store.getState().permissions.getPermissions({ item: current }).edit).toBe(false);
    fresh.resolve({ edit: allowed });
    await nested;
    expect(store.getState().permissions.getPermissions({ item: current }).edit).toBe(false);
  });

  it("does not let deferred reentry supersede a later forced request", async () => {
    let nested: Promise<void> | undefined;
    let store: ReturnType<typeof createAppStore>;
    const current = item("one");
    const latest = deferred<Partial<Permissions>>();
    const resolver = jest.fn(() => {
      if (!nested) {
        nested = refreshItem(store, current);
        return { edit: true };
      }
      return latest.promise;
    });
    store = subject(resolver);
    const initial = refreshItem(store, current);
    const initialRejection = expect(initial).rejects.toBeInstanceOf(PermissionResolutionSupersededError);
    const nestedRejection = expect(nested).rejects.toBeInstanceOf(PermissionResolutionSupersededError);
    const newest = refreshItem(store, current);
    await Promise.all([initialRejection, nestedRejection]);
    expect(resolver).toHaveBeenCalledTimes(2);
    latest.resolve({ edit: false });
    await newest;
    expect(store.getState().permissions.getPermissions({ item: current }).edit).toBe(false);
  });

  it("does not deadlock if a resolver awaits its reentrant forced refresh", async () => {
    let nested: Promise<void> | undefined;
    let store: ReturnType<typeof createAppStore>;
    const current = item("one");
    const fresh = deferred<Partial<Permissions>>();
    const resolver = jest.fn(() => {
      if (!nested) {
        nested = refreshItem(store, current);
        return nested.then(() => ({ edit: true }));
      }
      return fresh.promise;
    });
    store = subject(resolver);
    const initial = refreshItem(store, current);
    const rejection = expect(initial).rejects.toBeInstanceOf(PermissionResolutionSupersededError);
    await rejection;
    expect(resolver).toHaveBeenCalledTimes(2);
    fresh.resolve({ edit: false });
    await nested;
    expect(store.getState().permissions.getPermissions({ item: current }).edit).toBe(false);
  });

  it("waits for a forced current-item refresh before returning its decision", async () => {
    const pending = deferred<Partial<Permissions>>();
    const resolver = jest.fn().mockReturnValueOnce({ edit: true }).mockReturnValueOnce(pending.promise);
    const store = subject(resolver);
    const current = item("one");
    await resolveItem(store, current);
    const refresh = refreshItem(store, current);
    expect(store.getState().permissions.getPermissions({ item: current }).edit).toBe(false);
    const authorization = resolveItem(store, current);
    expect(resolver).toHaveBeenCalledTimes(2);
    pending.resolve({ edit: false });
    await Promise.all([refresh, authorization]);
    expect(store.getState().permissions.getPermissions({ item: current }).edit).toBe(false);
  });

  it("does not revive an old grant after a forced refresh fails", async () => {
    const pending = deferred<Partial<Permissions>>();
    const resolver = jest.fn()
      .mockReturnValueOnce({ edit: true })
      .mockReturnValueOnce(pending.promise)
      .mockReturnValueOnce({ edit: true });
    const store = subject(resolver);
    const current = item("one");
    await resolveItem(store, current);
    const refresh = refreshItem(store, current);
    const rejection = expect(refresh).rejects.toThrow("refresh failed");
    pending.reject(new Error("refresh failed"));
    await rejection;
    expect(store.getState().permissions.getPermissions({ item: current }).edit).toBe(false);
    await resolveItem(store, current);
    expect(store.getState().permissions.getPermissions({ item: current }).edit).toBe(true);
  });

  it("keeps an old grant disabled when the refresh being awaited is superseded", async () => {
    const old = deferred<Partial<Permissions>>();
    const latest = deferred<Partial<Permissions>>();
    const resolver = jest.fn()
      .mockReturnValueOnce({ edit: true })
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(latest.promise);
    const store = subject(resolver);
    const current = item("one");
    await resolveItem(store, current);
    const oldRefresh = refreshItem(store, current);
    const authorization = resolveItem(store, current);
    const oldRejection = expect(oldRefresh).rejects.toMatchObject({
      name: "PermissionResolutionSupersededError",
      code: "PUCK_PERMISSION_SUPERSEDED",
    });
    const authorizationRejection = expect(authorization).rejects.toBeInstanceOf(PermissionResolutionSupersededError);
    const latestRefresh = refreshItem(store, current);
    await Promise.all([oldRejection, authorizationRejection]);
    // Neither the old resolver nor the replacement has settled yet.
    expect(store.getState().permissions.getPermissions({ item: current }).edit).toBe(false);
    old.resolve({ edit: true });
    await old.promise;
    expect(store.getState().permissions.getPermissions({ item: current }).edit).toBe(false);
    latest.resolve({ edit: false });
    await latestRefresh;
    expect(store.getState().permissions.getPermissions({ item: current }).edit).toBe(false);
  });


  it.each(["item", "root"])("re-resolves when only %s read-only metadata changes", async (kind) => {
    const resolver = jest.fn().mockReturnValue({ edit: true });
    const store = subject(resolver);
    if (kind === "root") {
      store.setState({ config: { components: {}, root: { resolvePermissions: resolver } } });
    }
    const first: ComponentData = {
      type: kind === "root" ? "root" : "Example",
      props: { id: kind === "root" ? "root" : "one", value: "a" },
      readOnly: { value: false },
    };
    const second: ComponentData = { ...first, readOnly: { value: true } };
    await resolveItem(store, first);
    await resolveItem(store, second);
    expect(resolver).toHaveBeenCalledTimes(2);
    expect(store.getState().permissions.getPermissions({ item: second }).edit).toBe(true);
  });

  it("does not start a stale resolver if loading notification replaces its policy", async () => {
    const resolver = jest.fn().mockReturnValue({ edit: true });
    const store = subject(resolver);
    const cleanup = jest.fn();
    store.setState({
      setComponentLoading: () => {
        store.setState({ config: { components: {} } });
        return cleanup;
      },
    });
    await expect(resolveItem(store, item("one"))).rejects.toBeInstanceOf(PermissionResolutionSupersededError);
    expect(resolver).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("shares an identical in-flight resolution between non-forced callers", async () => {
    const pending = deferred<Partial<Permissions>>();
    const resolver = jest.fn().mockReturnValue(pending.promise);
    const store = subject(resolver);
    const current = item("one");
    const first = resolveItem(store, current);
    const second = resolveItem(store, current);
    expect(resolver).toHaveBeenCalledTimes(1);
    pending.resolve({ edit: true });
    await Promise.all([first, second]);
    expect(store.getState().permissions.getPermissions({ item: current }).edit).toBe(true);
  });

  it("propagates a shared in-flight resolution failure to every caller", async () => {
    const pending = deferred<Partial<Permissions>>();
    const resolver = jest.fn().mockReturnValue(pending.promise);
    const store = subject(resolver);
    const current = item("one");
    const first = resolveItem(store, current);
    const second = resolveItem(store, current);
    const results = Promise.allSettled([first, second]);
    pending.reject(new Error("shared failure"));
    const settled = await results;
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(settled.map((result) => result.status)).toEqual(["rejected", "rejected"]);
    expect(store.getState().permissions.getPermissions({ item: current }).edit).toBe(false);
  });

  it("exposes a proposed root decision only for its resolved inputs", async () => {
    const store = createAppStore();
    store.setState({
      config: {
        components: {},
        root: { resolvePermissions: jest.fn().mockReturnValue({ edit: true }) },
      },
    });
    const proposed = { type: "root", props: { id: "root", title: "candidate" } };
    expect(store.getState().permissions.getPermissions({ item: proposed }).edit).toBe(false);
    await resolveItem(store, proposed);
    expect(store.getState().permissions.getPermissions({ item: proposed }).edit).toBe(true);
    expect(store.getState().permissions.getPermissions({ root: true }).edit).toBe(false);
    const { state } = store.getState();
    store.setState({ state: { ...state, ui: { ...state.ui, previewMode: "interactive" } } });
    expect(store.getState().permissions.getPermissions({ item: proposed }).edit).toBe(false);
  });

  it("uses the same root shape after indexed all-item resolution", async () => {
    const store = createAppStore();
    const config = {
      components: {},
      root: { resolvePermissions: jest.fn().mockReturnValue({ edit: true }) },
    };
    const { state } = store.getState();
    store.setState({
      config,
      state: walkAppState(
        { ...state, data: { ...state.data, root: { props: { title: "root" } } } },
        config,
      ),
    });
    await store.getState().permissions.resolvePermissions();
    expect(store.getState().permissions.getPermissions({ root: true }).edit).toBe(true);
  });

  it("keeps item and root controls disabled until their first decisions resolve", async () => {
    const itemPending = deferred<Partial<Permissions>>();
    const rootPending = deferred<Partial<Permissions>>();
    const store = subject(jest.fn().mockReturnValue(itemPending.promise));
    store.setState({
      config: {
        ...store.getState().config,
        root: { resolvePermissions: jest.fn().mockReturnValue(rootPending.promise) },
      },
    });
    const current = item("pending");
    expect(store.getState().permissions.getPermissions({ item: current }).edit).toBe(false);
    expect(store.getState().permissions.getPermissions({ root: true }).edit).toBe(false);
    const itemCall = resolveItem(store, current);
    const rootCall = refreshRoot(store);
    itemPending.resolve({ edit: true });
    rootPending.resolve({ edit: true });
    await Promise.all([itemCall, rootCall]);
    expect(store.getState().permissions.getPermissions({ item: current }).edit).toBe(true);
    expect(store.getState().permissions.getPermissions({ root: true }).edit).toBe(true);
  });

  it("does not grant controls when the first dynamic decision rejects", async () => {
    const pending = deferred<Partial<Permissions>>();
    const store = subject(jest.fn().mockReturnValue(pending.promise));
    const current = item("pending");
    const call = resolveItem(store, current);
    const rejection = expect(call).rejects.toThrow("decision failed");
    pending.reject(new Error("decision failed"));
    await rejection;
    expect(store.getState().permissions.getPermissions({ item: current }).edit).toBe(false);
  });

  it("handles hook-triggered resolver rejection without logging resolver data", async () => {
    const report = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const store = subject(jest.fn().mockRejectedValue(new Error("sensitive detail")));
      const current = item("pending");
      const { state, config } = store.getState();
      store.setState({
        state: walkAppState(
          { ...state, data: { ...state.data, content: [current] } },
          config,
        ),
      });
      const hook = renderHook(() => useRegisterPermissionsSlice(store, {}));
      await waitFor(() => expect(report).toHaveBeenCalledWith("Puck could not resolve editor permissions."));
      expect(store.getState().permissions.getPermissions({ item: current }).edit).toBe(false);
      hook.unmount();
    } finally {
      report.mockRestore();
    }
  });

  it("re-resolves a child after its parent props change", async () => {
    const resolver = jest.fn().mockReturnValue({ edit: false });
    const store = subject(resolver);
    const config = {
      components: {
        ...store.getState().config.components,
        Container: { fields: { children: { type: "slot" as const } }, render: () => <div /> },
      },
    };
    const child = item("child");
    const parent = (label: string) => ({
      type: "Container",
      props: { id: "parent", label, children: [child] },
    });
    const setParent = (label: string) => {
      const { state } = store.getState();
      store.setState({
        config,
        state: walkAppState(
          { ...state, data: { ...state.data, content: [parent(label)] } },
          config,
        ),
      });
    };
    setParent("old");
    await resolveItem(store, child);
    setParent("new");
    await resolveItem(store, child);
    expect(resolver).toHaveBeenCalledTimes(2);
    expect(resolver.mock.calls[1][1].parent.props.label).toBe("new");
  });

  it("discards a pending result after the resolver's editor state changes", async () => {
    const old = deferred<Partial<Permissions>>();
    const resolver = jest.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce({ edit: false });
    const store = subject(resolver);
    const current = item("one");
    const oldCall = refreshItem(store, current);
    const oldRejection = expect(oldCall).rejects.toBeInstanceOf(PermissionResolutionSupersededError);
    const { state } = store.getState();
    store.setState({ state: { ...state, ui: { ...state.ui, previewMode: "interactive" } } });
    await resolveItem(store, current);
    old.resolve({ edit: true });
    await oldRejection;
    expect(resolver).toHaveBeenCalledTimes(2);
    expect(resolver.mock.calls[1][1].appState.ui.previewMode).toBe("interactive");
    expect(store.getState().permissions.getPermissions({ item: current }).edit).toBe(false);
  });

  it("does not expose an old grant while changed editor state is unresolved", async () => {
    const pending = deferred<Partial<Permissions>>();
    const resolver = jest.fn().mockReturnValueOnce({ edit: true }).mockReturnValueOnce(pending.promise);
    const store = subject(resolver);
    const current = item("one");
    await resolveItem(store, current);
    expect(store.getState().permissions.getPermissions({ item: current }).edit).toBe(true);
    const { state } = store.getState();
    store.setState({ state: { ...state, ui: { ...state.ui, previewMode: "interactive" } } });
    expect(store.getState().permissions.getPermissions({ item: current }).edit).toBe(false);
    const refresh = refreshItem(store, current);
    pending.resolve({ edit: false });
    await refresh;
    expect(store.getState().permissions.getPermissions({ item: current }).edit).toBe(false);
  });

  it("refreshes permissions when mounted editor UI state changes", async () => {
    const resolver = jest.fn().mockReturnValue({ edit: false });
    const store = subject(resolver);
    const { state, config } = store.getState();
    store.setState({
      state: walkAppState(
        { ...state, data: { ...state.data, content: [item("one")] } },
        config,
      ),
    });
    const globals = {};
    const hook = renderHook(() => useRegisterPermissionsSlice(store, globals));
    await waitFor(() => expect(resolver).toHaveBeenCalled());
    const previousCalls = resolver.mock.calls.length;
    act(() => store.getState().setUi({ previewMode: "interactive" }));
    await waitFor(() => expect(resolver.mock.calls.length).toBeGreaterThan(previousCalls));
    expect(resolver.mock.calls[resolver.mock.calls.length - 1][1].appState.ui.previewMode).toBe("interactive");
    hook.unmount();
  });

  it("preserves a resolved denial across equivalent global-permission props", async () => {
    const resolver = jest.fn().mockReturnValue({ edit: false });
    const store = subject(resolver);
    const { state, config } = store.getState();
    const current = item("one");
    store.setState({
      state: walkAppState(
        { ...state, data: { ...state.data, content: [current] } },
        config,
      ),
    });
    const hook = renderHook(
      ({ permissions }) => useRegisterPermissionsSlice(store, permissions),
      { initialProps: { permissions: {} } },
    );
    await waitFor(() => expect(store.getState().permissions.resolvedPermissions.one).toEqual({ edit: false }));
    const calls = resolver.mock.calls.length;
    hook.rerender({ permissions: {} });
    expect(store.getState().permissions.getPermissions({ item: current }).edit).toBe(false);
    expect(resolver).toHaveBeenCalledTimes(calls);
    hook.unmount();
  });

  it.each(["type", "all"])("waits for every item in a %s refresh", async (scope) => {
    const first = deferred<Partial<Permissions>>();
    const second = deferred<Partial<Permissions>>();
    const resolver = jest.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const store = subject(resolver);
    const { state, config } = store.getState();
    store.setState({
      state: walkAppState(
        { ...state, data: { ...state.data, content: [item("one"), item("two")] } },
        config,
      ),
    });

    let completed = false;
    const call = store.getState().permissions
      .refreshPermissions(scope === "type" ? { type: "Example" } : {})
      .then(() => { completed = true; });
    first.resolve({ edit: false });
    await Promise.resolve();
    expect(completed).toBe(false);
    second.resolve({ edit: false });
    await call;
    expect(completed).toBe(true);
    expect(resolver).toHaveBeenCalledTimes(2);
  });

  it("does not reuse a decision after the component resolver is removed", async () => {
    const store = subject(jest.fn().mockResolvedValue({ edit: true }));
    const current = item("one");
    await resolveItem(store, current);
    expect(store.getState().permissions.getPermissions({ item: current }).edit).toBe(true);

    store.setState({
      config: {
        components: { Example: { render: () => <div />, permissions: { edit: false } } },
      },
    });
    expect(store.getState().permissions.getPermissions({ item: current }).edit).toBe(false);
  });

  it("does not reuse a root decision after its resolver is replaced", async () => {
    const store = createAppStore();
    const resolvePermissions = jest.fn().mockResolvedValue({ edit: true });
    store.setState({ config: { components: {}, root: { resolvePermissions } } });
    await refreshRoot(store);
    expect(store.getState().permissions.getPermissions({ root: true }).edit).toBe(true);

    store.setState({
      config: {
        components: {},
        root: {
          permissions: { edit: false },
          resolvePermissions: jest.fn().mockResolvedValue({ edit: false }),
        },
      },
    });
    expect(store.getState().permissions.getPermissions({ root: true }).edit).toBe(false);
  });

  it("does not let an old decision override changed static permissions", async () => {
    const store = subject(jest.fn().mockResolvedValue({ edit: true }));
    const current = item("one");
    await resolveItem(store, current);
    const previous = store.getState().config.components.Example;
    store.setState({
      config: {
        components: { Example: { ...previous, permissions: { edit: false } } },
      },
    });
    expect(store.getState().permissions.getPermissions({ item: current }).edit).toBe(false);
  });

  it("does not revive a cached decision when a prior config reference returns", async () => {
    const store = subject(jest.fn().mockResolvedValue({ edit: false }));
    const current = item("one");
    await resolveItem(store, current);
    const original = store.getState().config;
    expect(store.getState().permissions.getPermissions({ item: current }).edit).toBe(false);
    store.setState({ config: { components: {} } });
    store.setState({ config: original });
    expect(store.getState().permissions.getPermissions({ item: current }).edit).toBe(false);
  });

  it("discards a pending result when its resolver changes in place", async () => {
    const pending = deferred<Partial<Permissions>>();
    const store = subject(jest.fn().mockReturnValue(pending.promise));
    const current = item("one");
    const call = refreshItem(store, current);
    const rejection = expect(call).rejects.toBeInstanceOf(PermissionResolutionSupersededError);
    const component = store.getState().config.components.Example;
    component.permissions = { edit: false };
    component.resolvePermissions = jest.fn().mockResolvedValue({ edit: false });

    pending.resolve({ edit: true });
    await rejection;
    expect(store.getState().permissions.getPermissions({ item: current }).edit).toBe(false);
    expect(store.getState().permissions.resolvedPermissions.one).toBeUndefined();
  });

  it("keeps the newer direct result and cache when an older grant finishes last", async () => {
    const older = deferred<Partial<Permissions>>();
    const newer = deferred<Partial<Permissions>>();
    const resolver = jest
      .fn()
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    const store = subject(resolver);
    const first = item("one", "old");
    const second = item("one", "new");

    const firstCall = resolveItem(store, first);
    const firstRejection = expect(firstCall).rejects.toBeInstanceOf(PermissionResolutionSupersededError);
    const secondCall = resolveItem(store, second);
    newer.resolve({ edit: false });
    await secondCall;
    older.resolve({ edit: true });
    await firstRejection;

    expect(store.getState().permissions.getPermissions({ item: second }).edit).toBe(
      false,
    );
    expect(store.getState().permissions.cache.one).toMatchObject({
      lastData: second,
      lastPermissions: { edit: false },
    });
  });

  it("retains an accepted denial through pending and rejected forced refreshes", async () => {
    const older = deferred<Partial<Permissions>>();
    const newer = deferred<Partial<Permissions>>();
    const resolver = jest
      .fn()
      .mockReturnValueOnce({ edit: false })
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    const store = subject(resolver);
    const current = item("one");
    await store.getState().permissions.resolvePermissions({ item: current });
    const accepted = store.getState().permissions.cache.one;

    const olderCall = refreshItem(store, current);
    const olderRejection = expect(olderCall).rejects.toBeInstanceOf(PermissionResolutionSupersededError);
    const newerCall = refreshItem(store, current);
    const rejection = expect(newerCall).rejects.toThrow("denied refresh");
    expect(store.getState().permissions.getPermissions({ item: current }).edit).toBe(false);
    newer.reject(new Error("denied refresh"));
    await rejection;
    older.resolve({ edit: true });
    await olderRejection;

    expect(store.getState().permissions.getPermissions({ item: current }).edit).toBe(false);
    expect(store.getState().permissions.cache.one).toBe(accepted);
    expect(resolver.mock.calls[2][1].lastPermissions).toEqual({ edit: false });
  });

  it("invalidates a different pending input when returning to the accepted input", async () => {
    const pending = deferred<Partial<Permissions>>();
    const resolver = jest
      .fn()
      .mockReturnValueOnce({ edit: false })
      .mockReturnValueOnce(pending.promise)
      .mockReturnValueOnce({ edit: false });
    const store = subject(resolver);
    const accepted = item("one", "a");
    await store.getState().permissions.resolvePermissions({ item: accepted });
    const pendingCall = resolveItem(store, item("one", "b"));
    const pendingRejection = expect(pendingCall).rejects.toBeInstanceOf(PermissionResolutionSupersededError);
    await store.getState().permissions.resolvePermissions({ item: accepted });
    expect(resolver).toHaveBeenCalledTimes(3);
    pending.resolve({ edit: true });
    await pendingRejection;
    expect(store.getState().permissions.getPermissions({ item: accepted }).edit).toBe(false);
    expect(store.getState().permissions.cache.one.lastData).toEqual(accepted);
  });

  it("does not cancel a forced refresh when the same cached input is observed", async () => {
    const pending = deferred<Partial<Permissions>>();
    const resolver = jest
      .fn()
      .mockReturnValueOnce({ edit: true })
      .mockReturnValueOnce(pending.promise);
    const store = subject(resolver);
    const current = item("one");
    await store.getState().permissions.resolvePermissions({ item: current });
    const refresh = refreshItem(store, current);
    const observed = store.getState().permissions.resolvePermissions({ item: current });
    pending.resolve({ edit: false });
    await Promise.all([refresh, observed]);
    expect(store.getState().permissions.getPermissions({ item: current }).edit).toBe(false);
    expect(resolver).toHaveBeenCalledTimes(2);
  });

  it("reruns when a property is removed while retaining the changed argument semantics", async () => {
    const pending = deferred<Partial<Permissions>>();
    const resolver = jest
      .fn()
      .mockReturnValueOnce({ edit: true })
      .mockReturnValueOnce(pending.promise);
    const store = subject(resolver);
    const withValue = item("one");
    const withoutValue = { type: "Example", props: { id: "one" } };
    await store.getState().permissions.resolvePermissions({ item: withValue });
    const call = resolveItem(store, withoutValue);
    expect(resolver).toHaveBeenCalledTimes(2);
    expect(resolver.mock.calls[1][1].changed).toEqual({ id: false });
    pending.resolve({ edit: false });
    await call;
    expect(store.getState().permissions.getPermissions({ item: withoutValue }).edit).toBe(false);
  });

  it("supersedes an in-flight result when hook global permissions change", async () => {
    const older = deferred<Partial<Permissions>>();
    const newer = deferred<Partial<Permissions>>();
    const resolver = jest
      .fn()
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    const store = subject(resolver);
    const current = item("one");
    const state = store.getState().state;
    store.setState({
      state: { ...state, data: { ...state.data, content: [current] } },
    });
    const { rerender } = renderHook(
      ({ edit }) => useRegisterPermissionsSlice(store, { edit }),
      { initialProps: { edit: true } },
    );
    expect(resolver).toHaveBeenCalledTimes(1);
    rerender({ edit: false });
    expect(resolver).toHaveBeenCalledTimes(2);
    await act(async () => {
      newer.resolve({ edit: false });
      await newer.promise;
    });
    await act(async () => {
      older.resolve({ edit: true });
      await older.promise;
    });
    expect(store.getState().permissions.getPermissions({ item: current }).edit).toBe(false);
  });

  it("invalidates in-flight results on config and global replacement even if references are restored", async () => {
    const configRequest = deferred<Partial<Permissions>>();
    const globalRequest = deferred<Partial<Permissions>>();
    const resolver = jest
      .fn()
      .mockReturnValueOnce(configRequest.promise)
      .mockReturnValueOnce(globalRequest.promise);
    const store = subject(resolver);
    const config = store.getState().config;
    const globals = store.getState().permissions.globalPermissions;
    const first = item("config");
    const second = item("global");
    const firstCall = refreshItem(store, first);
    const firstRejection = expect(firstCall).rejects.toBeInstanceOf(PermissionResolutionSupersededError);
    store.setState({ config: { components: {} } });
    store.setState({ config });
    const secondCall = refreshItem(store, second);
    const secondRejection = expect(secondCall).rejects.toBeInstanceOf(PermissionResolutionSupersededError);
    store.setState({
      permissions: {
        ...store.getState().permissions,
        globalPermissions: { ...globals, edit: false },
      },
    });
    store.setState({
      permissions: { ...store.getState().permissions, globalPermissions: globals },
    });
    // Invalidation settles both callers without waiting for their resolvers.
    await Promise.all([firstRejection, secondRejection]);
    configRequest.resolve({ edit: true });
    globalRequest.resolve({ edit: true });
    await Promise.all([configRequest.promise, globalRequest.promise]);
    expect(store.getState().permissions.resolvedPermissions.config).toBeUndefined();
    expect(store.getState().permissions.resolvedPermissions.global).toBeUndefined();
  });

  it("reruns cached inputs after config or global replacement", async () => {
    const oldResolver = jest.fn().mockReturnValue({ edit: false });
    const newResolver = jest.fn().mockReturnValue({ delete: false });
    const store = subject(oldResolver);
    const current = item("one");
    await store.getState().permissions.resolvePermissions({ item: current });
    store.setState({
      config: {
        components: {
          Example: { render: () => <div />, resolvePermissions: newResolver },
        },
      },
    });
    await store.getState().permissions.resolvePermissions({ item: current });
    expect(newResolver).toHaveBeenCalledTimes(1);
    const permissions = store.getState().permissions;
    store.setState({
      permissions: {
        ...permissions,
        globalPermissions: { ...permissions.globalPermissions, drag: false },
      },
    });
    await store.getState().permissions.resolvePermissions({ item: current });
    expect(newResolver).toHaveBeenCalledTimes(2);
    expect(newResolver.mock.calls[1][1].permissions.drag).toBe(false);
  });

  it("keeps independent IDs independent and orders root refreshes", async () => {
    const one = deferred<Partial<Permissions>>();
    const two = deferred<Partial<Permissions>>();
    const rootOld = deferred<Partial<Permissions>>();
    const rootNew = deferred<Partial<Permissions>>();
    const store = subject(
      jest.fn().mockReturnValueOnce(one.promise).mockReturnValueOnce(two.promise),
    );
    store.setState({
      config: {
        ...store.getState().config,
        root: {
          resolvePermissions: jest
            .fn()
            .mockReturnValueOnce(rootOld.promise)
            .mockReturnValueOnce(rootNew.promise),
        },
      },
    });
    const first = item("one");
    const second = item("two");
    const firstCall = refreshItem(store, first);
    const secondCall = refreshItem(store, second);
    const oldRootCall = refreshRoot(store);
    const oldRootRejection = expect(oldRootCall).rejects.toBeInstanceOf(PermissionResolutionSupersededError);
    const newRootCall = refreshRoot(store);
    rootNew.resolve({ edit: false });
    two.resolve({ edit: false });
    await Promise.all([newRootCall, secondCall]);
    rootOld.resolve({ edit: true });
    one.resolve({ delete: false });
    await Promise.all([oldRootRejection, firstCall]);
    expect(store.getState().permissions.getPermissions({ root: true }).edit).toBe(false);
    expect(store.getState().permissions.getPermissions({ item: first }).delete).toBe(false);
    expect(store.getState().permissions.getPermissions({ item: second }).edit).toBe(false);
  });

  it("waits for root permission refresh before resolveComponentData completes", async () => {
    const pending = deferred<Partial<Permissions>>();
    const resolver = jest.fn().mockReturnValue(pending.promise);
    const store = createAppStore();
    store.setState({
      config: {
        components: {},
        root: {
          resolveData: (data) => ({ props: data.props }),
          resolvePermissions: resolver,
        },
      },
    });
    let completed = false;
    const call = store
      .getState()
      .resolveComponentData({ props: { title: "root" } }, "force")
      .then(() => {
        completed = true;
      });
    await waitFor(() => expect(resolver).toHaveBeenCalledTimes(1));
    expect(resolver.mock.calls[0][0].props.title).toBe("root");
    expect(completed).toBe(false);
    pending.resolve({ edit: false });
    await call;
    expect(completed).toBe(true);
    expect(store.getState().permissions.getPermissions({ root: true }).edit).toBe(false);
  });

  it("propagates a root refresh failure and cleans up component-data loading", async () => {
    const pending = deferred<Partial<Permissions>>();
    const resolver = jest.fn().mockReturnValue(pending.promise);
    const store = createAppStore();
    store.setState({
      config: {
        components: {},
        root: {
          resolveData: (data) => ({ props: data.props }),
          resolvePermissions: resolver,
        },
      },
    });
    const call = store.getState().resolveComponentData({ props: { title: "root" } }, "force");
    const rejection = expect(call).rejects.toThrow("root failure");
    await waitFor(() => expect(resolver).toHaveBeenCalledTimes(1));
    pending.reject(new Error("root failure"));
    await rejection;
    expect(store.getState().pendingLoadTimeouts).toEqual({});
    expect(store.getState().componentState.root?.loadingCount || 0).toBe(0);
  });

  it("propagates supersession through component-data resolution and cleans up loading", async () => {
    const first = deferred<Partial<Permissions>>();
    const replacement = deferred<Partial<Permissions>>();
    const resolver = jest.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(replacement.promise);
    const store = createAppStore();
    store.setState({
      config: {
        components: {},
        root: {
          resolveData: (data) => ({ props: data.props }),
          resolvePermissions: resolver,
        },
      },
    });
    const data = store.getState().resolveComponentData({ props: { title: "root" } }, "force");
    const dataRejection = expect(data).rejects.toBeInstanceOf(PermissionResolutionSupersededError);
    await waitFor(() => expect(resolver).toHaveBeenCalledTimes(1));
    const refresh = refreshRoot(store);
    await dataRejection;
    expect(store.getState().permissions.getPermissions({ root: true }).edit).toBe(false);
    replacement.resolve({ edit: false });
    await refresh;
    first.resolve({ edit: true });
    await first.promise;
    expect(store.getState().permissions.getPermissions({ root: true }).edit).toBe(false);
    expect(store.getState().pendingLoadTimeouts).toEqual({});
    expect(store.getState().componentState.root?.loadingCount || 0).toBe(0);
  });

  it("cleans up parent loading when a child resolver rejects", async () => {
    const store = createAppStore();
    store.setState({
      config: {
        components: {
          Container: {
            fields: { children: { type: "slot" } },
            render: () => <div />,
            resolveData: (data) => ({ props: data.props }),
          },
          Child: {
            render: () => <div />,
            resolveData: () => Promise.reject(new Error("child failure")),
          },
        },
      },
    });
    await expect(
      store.getState().resolveComponentData(
        {
          type: "Container",
          props: {
            id: "parent",
            children: [{ type: "Child", props: { id: "child" } }],
          },
        },
        "force",
      ),
    ).rejects.toThrow("child failure");
    expect(store.getState().pendingLoadTimeouts).toEqual({});
    expect(store.getState().componentState.parent?.loadingCount || 0).toBe(0);
    expect(store.getState().componentState.child?.loadingCount || 0).toBe(0);
  });

  it("releases superseded loading even when a newer refresh rejects", async () => {
    jest.useFakeTimers();
    try {
      const slow = deferred<Partial<Permissions>>();
      const fast = deferred<Partial<Permissions>>();
      const store = subject(
        jest.fn().mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise),
      );
      const current = item("one");
      const slowCall = refreshItem(store, current);
      const slowRejection = expect(slowCall).rejects.toBeInstanceOf(PermissionResolutionSupersededError);
      jest.advanceTimersByTime(50);
      expect(store.getState().componentState.one.loadingCount).toBe(1);
      const fastCall = refreshItem(store, current);
      const rejection = expect(fastCall).rejects.toThrow("failed");
      fast.reject(new Error("failed"));
      await rejection;
      expect(store.getState().componentState.one.loadingCount).toBe(0);
      slow.resolve({ edit: true });
      await slowRejection;
      expect(store.getState().componentState.one.loadingCount).toBe(0);
      expect(store.getState().pendingLoadTimeouts).toEqual({});
      jest.advanceTimersByTime(50);
      expect(store.getState().componentState.one.loadingCount).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it("does not let a superseded hanging request keep the panel loading", async () => {
    jest.useFakeTimers();
    try {
      const old = deferred<Partial<Permissions>>();
      const store = subject(
        jest.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce({ edit: true }),
      );
      const current = item("one");
      const oldCall = refreshItem(store, current);
      const oldRejection = expect(oldCall).rejects.toBeInstanceOf(PermissionResolutionSupersededError);
      jest.advanceTimersByTime(50);
      expect(store.getState().componentState.one.loadingCount).toBe(1);
      await refreshItem(store, current);
      expect(store.getState().componentState.one.loadingCount).toBe(0);
      expect(store.getState().permissions.getPermissions({ item: current }).edit).toBe(true);
      old.resolve({ edit: false });
      await oldRejection;
      expect(store.getState().componentState.one.loadingCount).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
