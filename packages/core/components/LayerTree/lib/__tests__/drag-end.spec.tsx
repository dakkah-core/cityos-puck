/** @jest-environment jsdom */
import { createAppStore, defaultAppState } from "../../../../store";
import { walkAppState } from "../../../../lib/data/walk-app-state";
import { moveComponent } from "../../../../lib/move-component";
import { rootDroppableId } from "../../../../lib/root-droppable-id";
import { Config } from "../../../../types";
import { onOutlineDragEnd } from "../dnd/handlers";
import { createOutlineDndStore } from "../store";

jest.mock("../../../../lib/move-component", () => ({
  moveComponent: jest.fn().mockResolvedValue(undefined),
}));

const config: Config = {
  components: {
    Card: { render: () => <div /> },
    Grid: {
      fields: { items: { type: "slot", allow: ["Card"] } },
      render: () => <div />,
    },
  },
};

const setup = () => {
  const appStore = createAppStore();
  const state = walkAppState(
    {
      ...defaultAppState,
      data: {
        ...defaultAppState.data,
        content: [
          { type: "Card", props: { id: "card" } },
          { type: "Grid", props: { id: "grid", items: [] } },
        ],
      },
    },
    config,
  );
  const dispatch = jest.fn();
  appStore.setState({ config, state, dispatch });
  const outlineDndStore = createOutlineDndStore();
  outlineDndStore.getState().startDrag({
    itemId: "card",
    componentType: "Card",
    zoneCompound: rootDroppableId,
    index: 0,
  });
  outlineDndStore.getState().setTarget(
    { targetId: "grid:items", position: "inside" },
    { zone: "grid:items", index: 0 },
  );
  // Simulate an accept decision made before the host changed the policy.
  outlineDndStore.getState().acceptCache.set("zone:grid:items", true);
  const finish = () =>
    onOutlineDragEnd(
      { canceled: false, operation: {} } as Parameters<typeof onOutlineDragEnd>[0],
      { appStore, outlineDndStore, scrollToComponent: jest.fn() },
    );
  return { appStore, outlineDndStore, dispatch, finish };
};

describe("outline drop commit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
  });

  afterEach(() => jest.restoreAllMocks());

  it("commits a still-authorized move into an allowed slot", () => {
    const { appStore, dispatch, finish } = setup();
    finish();
    expect(moveComponent).toHaveBeenCalledWith(
      "card",
      { zone: rootDroppableId, index: 0 },
      { zone: "grid:items", index: 0 },
      appStore,
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        ui: { itemSelector: { zone: "grid:items", index: 0 }, isDragging: false },
      }),
    );
  });

  it("cancels when drag permission is revoked after targeting", () => {
    const { appStore, dispatch, finish } = setup();
    const permissions = appStore.getState().permissions;
    appStore.setState({
      permissions: {
        ...permissions,
        globalPermissions: { ...permissions.globalPermissions, drag: false },
      },
    });
    finish();
    expect(moveComponent).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({
      type: "setUi",
      ui: { isDragging: false },
      recordHistory: false,
    });
  });

  it("cancels while a new dynamic permission decision is pending", async () => {
    const { appStore, finish } = setup();
    let resolveRefresh!: (value: { drag: boolean }) => void;
    const pending = new Promise<{ drag: boolean }>((resolve) => {
      resolveRefresh = resolve;
    });
    const resolver = jest
      .fn()
      .mockResolvedValueOnce({ drag: true })
      .mockReturnValueOnce(pending);
    appStore.setState({
      config: {
        ...config,
        components: {
          ...config.components,
          Card: { ...config.components.Card, resolvePermissions: resolver },
        },
      },
    });
    const item = appStore.getState().state.indexes.nodes.card.data;
    await appStore.getState().permissions.refreshPermissions({ item });
    expect(appStore.getState().permissions.getPermissions({ item }).drag).toBe(
      true,
    );
    const refresh = appStore.getState().permissions.refreshPermissions({ item });
    expect(resolver).toHaveBeenCalledTimes(2);
    expect(appStore.getState().permissions.getPermissions({ item }).drag).toBe(
      false,
    );
    finish();
    expect(moveComponent).not.toHaveBeenCalled();
    resolveRefresh({ drag: false });
    await refresh;
  });

  it("rechecks changed slot constraints instead of using the cached grant", () => {
    const { appStore, finish } = setup();
    appStore.setState({
      config: {
        ...config,
        components: {
          ...config.components,
          Grid: {
            ...config.components.Grid,
            fields: { items: { type: "slot", disallow: ["Card"] } },
          },
        },
      },
    });
    finish();
    expect(moveComponent).not.toHaveBeenCalled();
  });

  it("cancels if the source position now identifies a different item", () => {
    const { appStore, finish } = setup();
    const state = appStore.getState().state;
    appStore.setState({
      state: {
        ...state,
        indexes: {
          ...state.indexes,
          zones: {
            ...state.indexes.zones,
            [rootDroppableId]: {
              ...state.indexes.zones[rootDroppableId],
              contentIds: ["grid", "card"],
            },
          },
        },
      },
    });
    finish();
    expect(moveComponent).not.toHaveBeenCalled();
  });

  it("cancels if the target zone no longer exists", () => {
    const { outlineDndStore, finish } = setup();
    outlineDndStore.getState().setTarget(
      { targetId: "missing:items", position: "inside" },
      { zone: "missing:items", index: 0 },
    );
    finish();
    expect(moveComponent).not.toHaveBeenCalled();
  });

  it.each([undefined, { type: "text" as const }])(
    "cancels when an indexed slot no longer has a slot field: %s",
    (field) => {
      const { appStore, finish } = setup();
      appStore.setState({
        config: {
          ...config,
          components: {
            ...config.components,
            Grid: {
              ...config.components.Grid,
              fields: field ? { items: field } : {},
            },
          },
        },
      });
      finish();
      expect(moveComponent).not.toHaveBeenCalled();
    },
  );

  it("cancels when the indexed source slot is no longer a slot field", () => {
    const { appStore, outlineDndStore, finish } = setup();
    const state = walkAppState(
      {
        ...defaultAppState,
        data: {
          ...defaultAppState.data,
          content: [
            {
              type: "Grid",
              props: {
                id: "grid",
                items: [{ type: "Card", props: { id: "card" } }],
              },
            },
          ],
        },
      },
      config,
    );
    appStore.setState({
      state,
      config: {
        ...config,
        components: {
          ...config.components,
          Grid: { ...config.components.Grid, fields: {} },
        },
      },
    });
    outlineDndStore.getState().startDrag({
      itemId: "card",
      componentType: "Card",
      zoneCompound: "grid:items",
      index: 0,
    });
    outlineDndStore.getState().setTarget(
      { targetId: "grid", position: "after" },
      { zone: rootDroppableId, index: 1 },
    );
    finish();
    expect(moveComponent).not.toHaveBeenCalled();
  });

  it("cancels a same-zone drop past the last position after removal", () => {
    const { outlineDndStore, dispatch, finish } = setup();
    outlineDndStore.getState().setTarget(
      { targetId: "grid", position: "after" },
      { zone: rootDroppableId, index: 2 },
    );
    finish();
    expect(moveComponent).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({
      type: "setUi",
      ui: { isDragging: false },
      recordHistory: false,
    });
  });

  it("allows a same-zone drop at the final position after removal", () => {
    const { appStore, outlineDndStore, finish } = setup();
    outlineDndStore.getState().setTarget(
      { targetId: "grid", position: "after" },
      { zone: rootDroppableId, index: 1 },
    );
    finish();
    expect(moveComponent).toHaveBeenCalledWith(
      "card",
      { zone: rootDroppableId, index: 0 },
      { zone: rootDroppableId, index: 1 },
      appStore,
    );
  });

  it("rejects a drop into the dragged item's own slot", () => {
    const { appStore, outlineDndStore, finish } = setup();
    appStore.setState({
      config: {
        ...config,
        components: {
          ...config.components,
          Grid: {
            ...config.components.Grid,
            fields: { items: { type: "slot", allow: ["Grid"] } },
          },
        },
      },
    });
    outlineDndStore.getState().startDrag({
      itemId: "grid",
      componentType: "Grid",
      zoneCompound: rootDroppableId,
      index: 1,
    });
    outlineDndStore.getState().setTarget(
      { targetId: "grid:items", position: "inside" },
      { zone: "grid:items", index: 0 },
    );
    finish();
    expect(moveComponent).not.toHaveBeenCalled();
  });
});
