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
