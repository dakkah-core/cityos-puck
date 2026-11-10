"use client";

import {
  Config,
  DndConfig,
  IframeConfig,
  Overrides,
  AppState,
  UiState,
  Plugin,
  UserGenerics,
  Field,
  ComponentConfig,
  Metadata,
  ComponentData,
  RootDataWithProps,
  ResolveDataTrigger,
  RichtextField,
} from "../types";
import { createReducer, PuckAction } from "../reducer";
import { getItem } from "../lib/data/get-item";
import { defaultViewports } from "../components/ViewportControls/default-viewports";
import { Viewports } from "../types";
import { create, useStore } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { createContext, useContext } from "react";
import { createHistorySlice, type HistorySlice } from "./slices/history";
import { createNodesSlice, type NodesSlice } from "./slices/nodes";
import {
  createPermissionsSlice,
  PermissionResolutionSupersededError,
  type PermissionsSlice,
} from "./slices/permissions";
import { createFieldsSlice, type FieldsSlice } from "./slices/fields";
import { createFieldPolicyRefresh } from "./slices/field-policy";
import { resolveComponentData } from "../lib/resolve-component-data";
import { walkAppState } from "../lib/data/walk-app-state";
import { toRoot } from "../lib/data/to-root";
import { toComponent } from "../lib/data/to-component";
import { generateId } from "../lib/generate-id";
import { defaultAppState } from "./default-app-state";
import { FieldTransforms } from "../types/API/FieldTransforms";
import type { Dictionary } from "../lib/dictionary";
import type { Editor } from "@tiptap/react";

export { defaultAppState };

export type Status = "LOADING" | "MOUNTED" | "READY";

type ZoomConfig = {
  autoZoom: number;
  rootHeight: number;
  zoom: number;
};

type ComponentState = Record<string, { loadingCount: number }>;

export type AppStore<
  UserConfig extends Config = Config,
  G extends UserGenerics<UserConfig> = UserGenerics<UserConfig>,
> = {
  instanceId: string;
  state: G["UserAppState"];
  dispatch: (action: PuckAction) => void;
  config: UserConfig;
  componentState: ComponentState;
  setComponentState: (componentState: ComponentState) => void;
  setComponentLoading: (
    id: string,
    loading?: boolean,
    defer?: number,
  ) => () => void;
  unsetComponentLoading: (id: string) => void;
  pendingLoadTimeouts: Record<string, NodeJS.Timeout>;
  resolveComponentData: <T extends ComponentData | RootDataWithProps>(
    componentData: T,
    trigger: ResolveDataTrigger,
  ) => Promise<{ node: T; didChange: boolean }>;
  resolveAndCommitData: () => void;
  plugins: Plugin[];
  overrides: Partial<Overrides>;
  viewports: Viewports;
  zoomConfig: ZoomConfig;
  setZoomConfig: (zoomConfig: ZoomConfig) => void;
  status: Status;
  setStatus: (status: Status) => void;
  iframe: IframeConfig;
  _experimentalFullScreenCanvas: boolean;
  _experimentalVirtualization: boolean;
  selectedItem?: G["UserData"]["content"][0] | null;
  getCurrentData: () => G["UserData"]["content"][0] | G["UserData"]["root"];
  setUi: (ui: Partial<UiState>, recordHistory?: boolean) => void;
  getComponentConfig: (type?: string) => ComponentConfig | null | undefined;
  onAction?: (action: PuckAction, newState: AppState, state: AppState) => void;
  metadata: Metadata;
  dictionary: Dictionary;
  dnd?: DndConfig;
  fields: FieldsSlice;
  refreshFieldPolicy: () => Promise<void>;
  history: HistorySlice;
  nodes: NodesSlice;
  permissions: PermissionsSlice;
  fieldTransforms: FieldTransforms;
  currentRichText?: {
    inlineComponentId?: string;
    inline: boolean;
    field: RichtextField;
    editor: Editor;
    id: string;
  } | null;
};

const defaultPageFields: Record<string, Field> = {
  title: { type: "text" },
};

export const createAppStore = (initialAppStore?: Partial<AppStore>) => {
  let invalidatePermissionRequests = () => {};
  const store = create<AppStore>()(
    subscribeWithSelector((set, get) => ({
      instanceId: generateId(),
      state: defaultAppState,
      config: { components: {} },
      componentState: {},
      plugins: [],
      overrides: {},
      viewports: defaultViewports,
      zoomConfig: {
        autoZoom: 1,
        rootHeight: 0,
        zoom: 1,
      },
      status: "LOADING",
      iframe: {},
      _experimentalFullScreenCanvas: false,
      _experimentalVirtualization: false,
      metadata: {},
      dictionary: {},
      dnd: {},
      fieldTransforms: {},
      ...initialAppStore,
      fields: createFieldsSlice(set, get),
      refreshFieldPolicy: createFieldPolicyRefresh(set, get),
      history: createHistorySlice(set, get),
      nodes: createNodesSlice(set, get),
      permissions: createPermissionsSlice(set, get, (invalidate) => {
        invalidatePermissionRequests = invalidate;
      }),
      getCurrentData: () => {
        const s = get();

        return s.selectedItem ?? s.state.data.root;
      },
      getComponentConfig: (type?: string) => {
        const { config, selectedItem } = get();
        const rootFields = config.root?.fields || defaultPageFields;

        return type && type !== "root"
          ? config.components[type]
          : selectedItem
            ? config.components[selectedItem.type]
            : ({ ...config.root, fields: rootFields } as ComponentConfig);
      },
      selectedItem: initialAppStore?.state?.ui.itemSelector
        ? getItem(
            initialAppStore?.state?.ui.itemSelector,
            initialAppStore.state,
          )
        : null,
      dispatch: (action: PuckAction) =>
        set((s) => {
          const { record } = get().history;

          const dispatch = createReducer({
            record,
            appStore: s,
          });

          const state = dispatch(s.state, action);

          const selectedItem = state.ui.itemSelector
            ? getItem(state.ui.itemSelector, state)
            : null;

          get().onAction?.(action, state, get().state);

          return { ...s, state, selectedItem };
        }),
      setZoomConfig: (zoomConfig) => set({ zoomConfig }),
      setStatus: (status) => set({ status }),
      setComponentState: (componentState) => set({ componentState }),
      pendingLoadTimeouts: {},
      setComponentLoading: (
        id: string,
        loading: boolean = true,
        defer: number = 0,
      ) => {
        const { setComponentState } = get();

        const loadId = generateId();
        let started = false;
        let finished = false;

        const removeTimeout = () => {
          const pendingLoadTimeouts = { ...get().pendingLoadTimeouts };
          delete pendingLoadTimeouts[loadId];
          set({ pendingLoadTimeouts });
        };

        const setLoading = () => {
          const { componentState } = get();
          started = true;

          setComponentState({
            ...componentState,
            [id]: {
              ...componentState[id],
              loadingCount: (componentState[id]?.loadingCount || 0) + 1,
            },
          });
        };

        const unsetLoading = () => {
          if (finished) return;
          finished = true;
          clearTimeout(timeout);
          removeTimeout();

          if (loading && !started) return;

          // Removing the timeout notifies subscribers synchronously. Read the
          // count afterward so a reentrant loading update is not overwritten.
          const { componentState } = get();
          setComponentState({
            ...componentState,
            [id]: {
              ...componentState[id],
              loadingCount: Math.max(
                (componentState[id]?.loadingCount || 0) - 1,
                0,
              ),
            },
          });
        };

        const timeout = setTimeout(() => {
          if (loading) {
            setLoading();
            removeTimeout();
          } else {
            unsetLoading();
          }
        }, defer);

        set({
          pendingLoadTimeouts: {
            ...get().pendingLoadTimeouts,
            [loadId]: timeout,
          },
        });

        return unsetLoading;
      },
      unsetComponentLoading: (id: string) => {
        const { setComponentLoading } = get();

        setComponentLoading(id, false);
      },
      // Helper
      setUi: (ui: Partial<UiState>, recordHistory?: boolean) =>
        set((s) => {
          const dispatch = createReducer({
            record: () => {},
            appStore: s,
          });

          const state = dispatch(s.state, {
            type: "setUi",
            ui,
            recordHistory,
          });

          const selectedItem = state.ui.itemSelector
            ? getItem(state.ui.itemSelector, state)
            : null;

          return { ...s, state, selectedItem };
        }),
      resolveComponentData: async (componentData, trigger) => {
        const { config, metadata, setComponentLoading, permissions, state } =
          get();
        const componentId =
          "id" in componentData.props ? componentData.props.id : "root";
        const parentId = state.indexes.nodes[componentId]?.parentId;
        const parentNode = parentId ? state.indexes.nodes[parentId] : null;
        const parentData = parentNode?.data ?? null;

        const timeouts: Record<string, () => void> = {};
        const allTimeouts: Array<() => void> = [];
        let finished = false;

        try {
          return await resolveComponentData(
            componentData,
            config,
            metadata,
            (item) => {
              const id = "id" in item.props ? item.props.id : "root";
              const cleanup = setComponentLoading(id, true, 50);
              timeouts[id] = cleanup;
              allTimeouts.push(cleanup);
              // Siblings may continue resolving after another child rejects.
              if (finished) cleanup();
            },
            async (item) => {
              const id = "id" in item.props ? item.props.id : "root";

              try {
                await permissions.refreshPermissions({ item: toComponent(item) });
              } finally {
                timeouts[id]();
              }
            },
            trigger,
            parentData,
            state.data.root,
          );
        } finally {
          // A resolver or a child may fail before the parent's end callback.
          finished = true;
          for (const cleanup of allTimeouts) cleanup();
        }
      },
      resolveAndCommitData: async () => {
        const { config, state, dispatch, resolveComponentData } = get();

        walkAppState(
          state,
          config,
          (content) => content,
          (childItem, path) => {
            // Skip nested items as these get processed by the parent's resolveComponentData
            // Perf: wasteful to use walkAppState, which walks the entire tree
            if (path.length > 1) return childItem;

            void resolveComponentData(childItem, "load").then((resolved) => {
              const { state } = get();

              const node = state.indexes.nodes[resolved.node.props.id];

              // Ensure node hasn't been deleted whilst resolution happens
              if (node && resolved.didChange) {
                if (resolved.node.props.id === "root") {
                  dispatch({
                    type: "replaceRoot",
                    root: toRoot(resolved.node),
                  });
                } else {
                  // Use latest position, in case it's moved
                  const zoneCompound = `${node.parentId}:${node.zone}`;
                  const parentZone = state.indexes.zones[zoneCompound];

                  const index = parentZone.contentIds.indexOf(
                    resolved.node.props.id,
                  );

                  dispatch({
                    type: "replace",
                    data: resolved.node,
                    destinationIndex: index,
                    destinationZone: zoneCompound,
                  });
                }
              }
            }).catch((error) => {
              if (error instanceof PermissionResolutionSupersededError) return;
              // Resolver errors may contain host data.
              console.error("Puck could not resolve component data.");
            });

            return childItem;
          },
        );
      },
    })),
  );

  // Observe replacements even when no React permission subscription is mounted.
  store.subscribe((state, previous) => {
    if (
      state.config !== previous.config ||
      state.permissions.globalPermissions !==
        previous.permissions.globalPermissions
    ) {
      invalidatePermissionRequests();
    }
  });

  return store;
};

// Derived from createAppStore so it keeps the zustand middleware augmentations
// (e.g. subscribeWithSelector's two-argument subscribe overload).
export type AppStoreApi = ReturnType<typeof createAppStore>;

export const appStoreContext = createContext<AppStoreApi | null>(null);

// Fallback store used only when a component reads the store outside of a <Puck> provider (e.g. <Render> for SSR).
// Created lazily instead of at module scope so that importing @puckeditor/core has no side effects that might
// be unsupported in edge runtimes
let defaultAppStore: AppStoreApi | null = null;

const getDefaultAppStore = (): AppStoreApi => {
  if (!defaultAppStore) {
    defaultAppStore = createAppStore();
  }

  return defaultAppStore;
};

export function useAppStore<T>(selector: (state: AppStore) => T) {
  const context = useContext(appStoreContext) ?? getDefaultAppStore();

  return useStore(context, selector);
}

export function useAppStoreApi() {
  return useContext(appStoreContext) ?? getDefaultAppStore();
}

/** Returns true if the component is rendered within a appStore provider, false otherwise. */
export function useIsWithinPuck() {
  return useContext(appStoreContext) !== null;
}
