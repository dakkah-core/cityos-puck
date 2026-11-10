import { act } from "@testing-library/react";
import { createAppStore, defaultAppState } from "../../../store";
import { Config, ResolveDataTrigger } from "../../../types";
import { cache } from "../../resolve-component-data";
import { resolveAndReplaceData, resolveAndReplaceInlineData } from "../resolve-and-replace-data";
import { walkAppState } from "../walk-app-state";

const appStore = createAppStore();

const childResolveData = jest.fn(async (data, params) => {
  return {
    ...data,
    props: {
      resolvedProp: params.trigger,
    },
  };
});

const config: Config = {
  components: {
    Parent: {
      fields: { items: { type: "slot" } },
      render: () => <div />,
    },
    Child: {
      fields: {},
      resolveData: childResolveData,
      render: () => <div />,
    },
    StaticChild: {
      fields: { label: { type: "text" } },
      resolveData: async (data) => data, // Return the same data to simulate a no-op resolve
      render: () => <div />,
    },
  },
};

const child1 = {
  type: "Child",
  props: {
    id: "Child-1",
  },
};

function resetStores() {
  appStore.setState(
    {
      ...appStore.getInitialState(),
      config,
      state: walkAppState(
        {
          ...defaultAppState,
          data: {
            ...defaultAppState.data,
            content: [
              {
                type: "Parent",
                props: {
                  id: "Parent-1",
                  items: [
                    child1,
                    {
                      type: "Child",
                      props: {
                        id: "Child-2",
                      },
                    },
                    {
                      type: "Child",
                      props: {
                        id: "Child-3",
                      },
                    },
                  ],
                },
              },
              {
                type: "Parent",
                props: {
                  id: "Parent-2",
                  items: [],
                },
              },
              {
                type: "StaticChild",
                props: {
                  id: "Static-1",
                  label: "old",
                },
              },
            ],
          },
        },
        config,
      ),
    },
    true,
  );
}

describe("resolveAndReplaceData", () => {
  beforeEach(async () => {
    resetStores();
    jest.clearAllMocks();
    cache.lastChange = {};
  });

  it("resolves when called", async () => {
    // When: ---------------
    await act(() => resolveAndReplaceData(child1, appStore.getState));

    // Then: ---------------
    expect(childResolveData).toHaveBeenCalledTimes(1);
    const mockedReturn = await childResolveData.mock.results[0].value;
    expect(mockedReturn.props.resolvedProp).toBeDefined();
  });

  it("resolves with a 'force' trigger by default", async () => {
    // When: ---------------
    await act(() => resolveAndReplaceData(child1, appStore.getState));

    // Then: ---------------
    expect(childResolveData).toHaveBeenCalledTimes(1);
    const mockedReturn = await childResolveData.mock.results[0].value;
    expect(mockedReturn.props.resolvedProp).toBe("force");
  });

  it("resolves for non default triggers", async () => {
    // Given: --------------
    const trigger: ResolveDataTrigger = "insert";

    // When: ---------------
    await act(() => resolveAndReplaceData(child1, appStore.getState, trigger));

    // Then: ---------------
    expect(childResolveData).toHaveBeenCalledTimes(1);
    const mockedReturn = await childResolveData.mock.results[0].value;
    expect(mockedReturn.props.resolvedProp).toBe(trigger);
  });

  it("shows a warning if the id doesn't exist after resolving", async () => {
    // Given: --------------
    const consoleWarnMock = jest.spyOn(console, "warn").mockImplementation();
    const nonExistentComponent = {
      type: "Child",
      props: {
        id: "Doesn't exist",
      },
    };

    // When: ---------------
    await act(() =>
      resolveAndReplaceData(nonExistentComponent, appStore.getState),
    );

    // Then: ---------------
    expect(consoleWarnMock).toHaveBeenCalledTimes(1);
    consoleWarnMock.mockRestore();
  });

  describe("writeThrough", () => {
    const editedStaticChild = {
      type: "StaticChild",
      props: { id: "Static-1", label: "new" },
    };

    const getLabel = () =>
      appStore.getState().state.indexes.nodes["Static-1"].data.props.label;

    it("commits the edit when writeThrough is true even though the resolver reports no change", async () => {
      // When: ---------------
      await act(() =>
        resolveAndReplaceData(
          editedStaticChild, // Resolver returns same data, so didChange === false, keeping `old` in store.
          appStore.getState,
          "replace",
          true,
        ),
      );

      // Then: the edit is written through to the store
      expect(getLabel()).toBe("new");
    });

    it("does not commit the edit when writeThrough is false and the resolver reports no change", async () => {
      // When: ---------------
      await act(() =>
        resolveAndReplaceData(
          editedStaticChild,
          appStore.getState,
          "replace",
          false,
        ),
      );

      // Then: the no-op resolve is skipped and the store keeps the original data.
      // (This passing also proves didChange was false for the case above.)
      expect(getLabel()).toBe("old");
    });

    it("still commits when the resolver does change the data, regardless of writeThrough", async () => {
      // Given: Child's resolver always rewrites props (didChange === true)
      // When: writeThrough is false
      await act(() =>
        resolveAndReplaceData(child1, appStore.getState, "replace", false),
      );

      // Then: the resolved data is committed
      expect(
        appStore.getState().state.indexes.nodes["Child-1"].data.props
          .resolvedProp,
      ).toBe("replace");
    });
  });

  describe("inline text commits", () => {
    const edit = (value: string, canEdit = () => true) =>
      resolveAndReplaceInlineData(appStore, "Static-1", "label", value, canEdit);
    const label = () => appStore.getState().state.indexes.nodes["Static-1"].data.props.label;

    const defer = () => {
      let release!: () => void;
      const promise = new Promise<void>((resolve) => { release = resolve; });
      return { promise, release };
    };

    it.each(["unchanged", "revoked", "refreshed"])(
      "isolates candidate permission checks when current access is %s",
      async (change) => {
        const blocked = defer();
        const started = defer();
        let allowCurrent = true;
        const original = appStore.getState().config;
        appStore.setState({
          config: {
            ...original,
            components: {
              ...original.components,
              StaticChild: {
                ...original.components.StaticChild,
                resolvePermissions: async (data) => {
                  if (data.props.label === "draft") {
                    started.release();
                    await blocked.promise;
                    return { edit: true };
                  }
                  return { edit: allowCurrent };
                },
              },
            },
          },
        });
        const item = appStore.getState().state.indexes.nodes["Static-1"].data;
        await appStore.getState().permissions.resolvePermissions({ item });
        const cacheEntry = appStore.getState().permissions.cache["Static-1"];
        const pending = edit("draft");
        await started.promise;

        expect(appStore.getState().permissions.cache["Static-1"]).toBe(cacheEntry);
        expect(appStore.getState().permissions.getPermissions({ item }).edit).toBe(true);
        if (change !== "unchanged") {
          allowCurrent = change !== "revoked";
          await appStore.getState().permissions.refreshPermissions({ item });
        }
        blocked.release();
        expect(await pending).toBe(change === "unchanged");
        expect(label()).toBe(change === "unchanged" ? "draft" : "old");
      },
    );

    it("keeps a different queued field after dynamic permissions deny a candidate", async () => {
      const blocked = defer();
      const started = defer();
      const original = appStore.getState().config;
      appStore.setState({
        config: {
          ...original,
          components: {
            ...original.components,
            StaticChild: {
              ...original.components.StaticChild,
              resolvePermissions: async (data) => {
                if (data.props.label === "denied") {
                  started.release();
                  await blocked.promise;
                  return { edit: false };
                }
                return { edit: true };
              },
            },
          },
        },
      });
      const item = appStore.getState().state.indexes.nodes["Static-1"].data;
      await appStore.getState().permissions.resolvePermissions({ item });

      const first = edit("denied");
      await started.promise;
      const second = resolveAndReplaceInlineData(appStore, "Static-1", "body", "allowed", () => true);
      blocked.release();

      expect(await first).toBe(false);
      expect(await second).toBe(true);
      expect(appStore.getState().state.indexes.nodes["Static-1"].data.props).toEqual(
        expect.objectContaining({ label: "old", body: "allowed" }),
      );
    });

    it("supersedes a same-field edit even if its resolver never settles", async () => {
      const started = defer();
      const original = appStore.getState().resolveComponentData;
      appStore.setState({
        resolveComponentData: (async (data, trigger) => {
          if (data.props.label === "first") {
            started.release();
            await new Promise<void>(() => {});
          }
          return original(data, trigger);
        }) as typeof original,
      });
      const first = edit("first");
      await started.promise;
      const second = edit("second");
      expect(await first).toBe(false);
      expect(await second).toBe(true);
      expect(label()).toBe("second");
    });

    it("queues an edit submitted reentrantly by the replace action", async () => {
      let submitted = false;
      let second: Promise<boolean> | undefined;
      appStore.setState({
        onAction: (action) => {
          if (action.type === "replace" && !submitted) {
            submitted = true;
            second = resolveAndReplaceInlineData(appStore, "Static-1", "body", "second", () => true);
          }
        },
      });
      expect(await edit("first")).toBe(true);
      expect(second).toBeDefined();
      expect(await second).toBe(true);
      expect(appStore.getState().state.indexes.nodes["Static-1"].data.props).toEqual(
        expect.objectContaining({ label: "first", body: "second" }),
      );
    });

    it.each(["Static-1", "root"])(
      "commits different fields in order for %s using the latest component",
      async (id) => {
        const blocked = defer();
        const started = defer();
        const original = appStore.getState().resolveComponentData;
        const seen: unknown[] = [];
        appStore.setState({
          resolveComponentData: (async (data) => {
            seen.push({ ...data.props });
            if (data.props.label === "first" && !data.props.body) {
              started.release();
              await blocked.promise;
            }
            return { node: data, didChange: true };
          }) as typeof original,
        });
        const first = resolveAndReplaceInlineData(appStore, id, "label", "first", () => true);
        await started.promise;
        const second = resolveAndReplaceInlineData(appStore, id, "body", "second", () => true);
        const third = resolveAndReplaceInlineData(appStore, id, "label", "third", () => true);
        blocked.release();
        expect(await Promise.all([first, second, third])).toEqual([true, true, true]);
        expect(seen).toHaveLength(3);
        expect(seen[1]).toEqual(expect.objectContaining({ label: "first", body: "second" }));
        expect(seen[2]).toEqual(expect.objectContaining({ label: "third", body: "second" }));
        expect(appStore.getState().state.indexes.nodes[id].data.props).toEqual(
          expect.objectContaining({ label: "third", body: "second" }),
        );
      },
    );

    it.each(["permissions", "replacement", "read-only"])(
      "cancels queued edits when %s changes while they wait",
      async (change) => {
        const blocked = defer();
        const started = defer();
        const original = appStore.getState().resolveComponentData;
        appStore.setState({
          resolveComponentData: (async (data) => {
            started.release();
            await blocked.promise;
            return { node: data, didChange: true };
          }) as typeof original,
        });
        let editable = true;
        const first = edit("first");
        await started.promise;
        const second = resolveAndReplaceInlineData(appStore, "Static-1", "body", "second", () => editable);
        if (change === "permissions") {
          const permissions = appStore.getState().permissions;
          appStore.setState({ permissions: { ...permissions, globalPermissions: { ...permissions.globalPermissions, edit: false } } });
          appStore.setState({ permissions });
        } else if (change === "replacement") {
          appStore.getState().dispatch({ type: "replace", destinationZone: "root:default-zone", destinationIndex: 2, data: { type: "StaticChild", props: { id: "Static-1", label: "external" } } });
        } else {
          editable = false;
          appStore.setState({ currentRichText: null });
          editable = true;
        }
        expect(await second).toBe(false);
        blocked.release();
        await first;
        expect(appStore.getState().state.indexes.nodes["Static-1"].data.props.body).toBeUndefined();
      },
    );

    it("continues with the next field when a preceding candidate is denied", async () => {
      const blocked = defer();
      const started = defer();
      const permissions = appStore.getState().permissions;
      appStore.setState({
        permissions: {
          ...permissions,
          resolvePermissions: jest.fn(async ({ item } = {}) => {
            if (item?.props.label === "denied") {
              started.release();
              await blocked.promise;
            }
          }),
          getPermissions: ({ item } = {}) => ({
            ...permissions.globalPermissions,
            edit: item?.props.label !== "denied",
          }),
          resolveCandidatePermissions: async (item) => {
            if (item.props.label === "denied") {
              started.release();
              await blocked.promise;
            }
            return { permissions: { ...permissions.globalPermissions, edit: item.props.label !== "denied" }, isCurrent: () => true };
          },
        },
      });
      const first = edit("denied");
      await started.promise;
      const second = resolveAndReplaceInlineData(appStore, "Static-1", "body", "allowed", () => true);
      blocked.release();
      expect(await first).toBe(false);
      expect(await second).toBe(true);
      expect(appStore.getState().state.indexes.nodes["Static-1"].data.props).toEqual(
        expect.objectContaining({ label: "old", body: "allowed" }),
      );
    });

    it("does not apply a queued field after the preceding edit makes it read-only", async () => {
      const blocked = defer();
      const started = defer();
      const original = appStore.getState().resolveComponentData;
      appStore.setState({
        resolveComponentData: (async (data) => {
          started.release();
          await blocked.promise;
          return { node: { ...data, readOnly: { body: true } }, didChange: true };
        }) as typeof original,
      });
      const first = edit("first");
      await started.promise;
      const second = resolveAndReplaceInlineData(appStore, "Static-1", "body", "second", () => true);
      blocked.release();
      expect(await first).toBe(true);
      expect(await second).toBe(false);
      const node = appStore.getState().state.indexes.nodes["Static-1"].data;
      expect(node.readOnly?.body).toBe(true);
      expect(node.props.body).toBeUndefined();
    });

    it("does not bypass an active edit when a queued edit is canceled", async () => {
      const blocked = defer();
      const started = defer();
      const original = appStore.getState().resolveComponentData;
      const resolve = jest.fn(async (data) => {
        if (data.props.label === "first" && !data.props.body) {
          started.release();
          await blocked.promise;
        }
        return { node: data, didChange: true };
      });
      appStore.setState({ resolveComponentData: resolve as typeof original });
      const first = edit("first");
      await started.promise;
      let editable = true;
      const canceled = resolveAndReplaceInlineData(appStore, "Static-1", "body", "canceled", () => editable);
      editable = false;
      appStore.setState({ currentRichText: null });
      expect(await canceled).toBe(false);
      const last = resolveAndReplaceInlineData(appStore, "Static-1", "body", "last", () => true);
      await Promise.resolve();
      await Promise.resolve();
      expect(resolve).toHaveBeenCalledTimes(1);
      blocked.release();
      expect(await Promise.all([first, last])).toEqual([true, true]);
      expect(appStore.getState().state.indexes.nodes["Static-1"].data.props).toEqual(
        expect.objectContaining({ label: "first", body: "last" }),
      );
    });

    it("does not rebase a queued edit across a reentrant state change during dispatch", async () => {
      const blocked = defer();
      const started = defer();
      const original = appStore.getState().resolveComponentData;
      appStore.setState({
        resolveComponentData: (async (data) => {
          if (data.props.label === "first") {
            started.release();
            await blocked.promise;
          }
          return { node: data, didChange: true };
        }) as typeof original,
        onAction: (action) => {
          if (action.type === "replace") {
            const state = appStore.getState().state;
            appStore.setState({ state: { ...state, ui: { ...state.ui } } });
          }
        },
      });
      const first = edit("first");
      await started.promise;
      const second = resolveAndReplaceInlineData(appStore, "Static-1", "body", "second", () => true);
      blocked.release();
      expect(await first).toBe(true);
      expect(await second).toBe(false);
      expect(appStore.getState().state.indexes.nodes["Static-1"].data.props.body).toBeUndefined();
    });

    it("checks the resolved candidate's edit permission", async () => {
      const permissions = appStore.getState().permissions;
      appStore.setState({
        permissions: {
          ...permissions,
          resolvePermissions: jest.fn().mockResolvedValue(undefined),
          getPermissions: ({ item } = {}) => ({
            ...permissions.globalPermissions,
            edit: item?.props.label !== "denied",
          }),
          resolveCandidatePermissions: async (item) => ({
            permissions: { ...permissions.globalPermissions, edit: item.props.label !== "denied" },
            isCurrent: () => true,
          }),
        },
      });
      expect(await edit("denied")).toBe(false);
      expect(label()).toBe("old");
      expect(await edit("allowed")).toBe(true);
      expect(label()).toBe("allowed");
    });

    it("supports root edits and checks the root candidate", async () => {
      const permissions = appStore.getState().permissions;
      appStore.setState({
        permissions: {
          ...permissions,
          resolvePermissions: jest.fn().mockResolvedValue(undefined),
          getPermissions: ({ item } = {}) => ({
            ...permissions.globalPermissions,
            edit: item?.props.title !== "denied",
          }),
          resolveCandidatePermissions: async (item) => ({
            permissions: { ...permissions.globalPermissions, edit: item.props.title !== "denied" },
            isCurrent: () => true,
          }),
        },
      });
      expect(await resolveAndReplaceInlineData(appStore, "root", "title", "denied", () => true)).toBe(false);
      expect(await resolveAndReplaceInlineData(appStore, "root", "title", "allowed", () => true)).toBe(true);
      expect(appStore.getState().state.data.root.props?.title).toBe("allowed");
    });

    it.each(["Static-1", "root"])(
      "commits structured content for %s and follows its reducer's UI behavior",
      async (id) => {
        const content = { type: "doc", content: [{ type: "paragraph" }] };
        const ui = { field: { focus: "body" } };
        const previousField = appStore.getState().state.ui.field;
        expect(await resolveAndReplaceInlineData(appStore, id, "body", content, () => true, ui)).toBe(true);
        const state = appStore.getState().state;
        expect(state.indexes.nodes[id].data.props.body).toEqual(content);
        if (id === "root") {
          // The existing replaceRoot reducer does not apply action.ui.
          expect(state.ui.field).toEqual(previousField);
        } else {
          expect(state.ui.field).toEqual(ui.field);
        }
      },
    );

    it("does not apply UI metadata when candidate permission is denied", async () => {
      const permissions = appStore.getState().permissions;
      const previousField = appStore.getState().state.ui.field;
      appStore.setState({
        permissions: {
          ...permissions,
          resolvePermissions: jest.fn().mockResolvedValue(undefined),
          getPermissions: ({ item } = {}) => ({
            ...permissions.globalPermissions,
            edit: item?.props.body !== "denied",
          }),
          resolveCandidatePermissions: async (item) => ({
            permissions: { ...permissions.globalPermissions, edit: item.props.body !== "denied" },
            isCurrent: () => true,
          }),
        },
      });
      expect(await resolveAndReplaceInlineData(appStore, "Static-1", "body", "denied", () => true, { field: { focus: "body" } })).toBe(false);
      expect(appStore.getState().state.ui.field).toEqual(previousField);
    });

    it("cancels if app state changes while candidate permissions are pending", async () => {
      let release!: () => void;
      let started!: () => void;
      const waiting = new Promise<void>((resolve) => { release = resolve; });
      const resolving = new Promise<void>((resolve) => { started = resolve; });
      const permissions = appStore.getState().permissions;
      appStore.setState({
        permissions: {
          ...permissions,
          resolvePermissions: jest.fn(async ({ item } = {}) => {
            if (item?.props.label === "draft") {
              started();
              await waiting;
            }
          }),
          resolveCandidatePermissions: async (item) => {
            if (item.props.label === "draft") {
              started();
              await waiting;
            }
            return { permissions: permissions.globalPermissions, isCurrent: () => true };
          },
        },
      });
      const previousField = appStore.getState().state.ui.field;
      const pending = resolveAndReplaceInlineData(appStore, "Static-1", "label", "draft", () => true, { field: { focus: "draft" } });
      await resolving;
      const state = appStore.getState().state;
      appStore.setState({ state: { ...state, ui: { ...state.ui } } });
      expect(await pending).toBe(false);
      release();
      expect(label()).toBe("old");
      expect(appStore.getState().state.ui.field).toEqual(previousField);
    });

    it.each(["permissions", "data", "read-only"])(
      "drops a pending edit after %s changes",
      async (change) => {
        let release!: () => void;
        let started!: () => void;
        const waiting = new Promise<void>((resolve) => { release = resolve; });
        const resolving = new Promise<void>((resolve) => { started = resolve; });
        const original = appStore.getState().resolveComponentData;
        appStore.setState({
          resolveComponentData: (async (data, trigger) => {
            started();
            await waiting;
            return original(data, trigger);
          }) as typeof original,
        });
        let editable = true;
        const pending = edit("draft", () => editable);
        await resolving;
        if (change === "permissions") {
          const permissions = appStore.getState().permissions;
          appStore.setState({ permissions: { ...permissions, globalPermissions: { ...permissions.globalPermissions, edit: false } } });
          appStore.setState({ permissions });
        } else if (change === "data") {
          appStore.getState().dispatch({ type: "replace", destinationZone: "root:default-zone", destinationIndex: 2, data: { type: "StaticChild", props: { id: "Static-1", label: "external" } } });
        } else {
          editable = false;
        }
        release();
        expect(await pending).toBe(false);
        expect(label()).toBe(change === "data" ? "external" : "old");
      },
    );

    it("supersedes an older pending edit without letting it overwrite the newer value", async () => {
      let release!: () => void;
      let started!: () => void;
      const waiting = new Promise<void>((resolve) => { release = resolve; });
      const resolving = new Promise<void>((resolve) => { started = resolve; });
      const original = appStore.getState().resolveComponentData;
      appStore.setState({
        resolveComponentData: (async (data, trigger) => {
          if (data.props.label === "first") {
            started();
            await waiting;
          }
          return original(data, trigger);
        }) as typeof original,
      });
      const first = edit("first");
      await resolving;
      expect(await edit("second")).toBe(true);
      release();
      expect(await first).toBe(false);
      expect(label()).toBe("second");
    });
  });
});
