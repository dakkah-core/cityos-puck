import { useAppStoreApi } from "../../store";
import { ComponentData, ResolveDataTrigger, UiState } from "../../types";

import { getSelectorForId } from "../get-selector-for-id";

import { toComponent } from "./to-component";
import { toRoot } from "./to-root";
import { setDeep } from "./set-deep";

type AppStoreApi = ReturnType<typeof useAppStoreApi>;
const inlineEdits = new WeakMap<AppStoreApi, Map<string, () => void>>();

/**
 * Commit an inline edit only while its target and authorization remain current.
 * `canEdit` must stay false for this request after any external revocation.
 * Root replacement currently ignores `ui` in the existing reducer.
 */
export async function resolveAndReplaceInlineData(
  appStore: AppStoreApi,
  id: string,
  path: string,
  value: unknown,
  canEdit: () => boolean,
  ui?: Partial<UiState>,
): Promise<boolean> {
  let edits = inlineEdits.get(appStore);
  if (!edits) {
    edits = new Map();
    inlineEdits.set(appStore, edits);
  }
  edits.get(id)?.();

  let canceled = false;
  let cancelWait!: () => void;
  const interrupted = new Promise<false>((resolve) => {
    cancelWait = () => resolve(false);
  });
  const cancel = () => {
    canceled = true;
    cancelWait();
  };
  edits.set(id, cancel);

  const initial = appStore.getState();
  const node = initial.state.indexes.nodes[id];
  const item = node?.data;
  const isRoot = id === "root" && item?.type === "root";
  const zone = node && `${node.parentId}:${node.zone}`;
  const index = zone
    ? initial.state.indexes.zones[zone]?.contentIds.indexOf(id)
    : -1;
  const wildcardPath = path.replace(/\[\d+\]/g, "[*]");
  let permissionEntry = initial.permissions.cache[id];
  const valid = () => {
    const current = appStore.getState();
    return (
      !canceled &&
      canEdit() &&
      current.config === initial.config &&
      current.permissions.globalPermissions ===
        initial.permissions.globalPermissions &&
      current.state.data === initial.state.data &&
      current.state.ui === initial.state.ui &&
      current.state.indexes.nodes[id]?.data === item &&
      !item?.readOnly?.[path] &&
      !item?.readOnly?.[wildcardPath]
    );
  };
  const unsubscribe = appStore.subscribe(() => {
    if (!valid()) {
      cancel();
      return;
    }
    const permissions = appStore.getState().permissions;
    const entry = permissions.cache[id];
    if (entry !== permissionEntry) {
      permissionEntry = entry;
      if (
        entry?.lastData &&
        permissions.getPermissions({ item: entry.lastData }).edit !== true
      ) cancel();
    }
  });

  try {
    if (!item || (!isRoot && (index === undefined || index < 0)) || !valid())
      return false;
    const authorize = async (candidate: ComponentData) => {
      await initial.permissions.resolvePermissions({ item: candidate });
      return (
        valid() &&
        appStore.getState().permissions.getPermissions({ item: candidate })
          .edit === true
      );
    };
    const work = (async () => {
      if (!(await authorize(item))) return false;
      const resolved = await initial.resolveComponentData(
        { ...item, props: setDeep(item.props, path, value) },
        "replace",
      );
      if (
        !valid() ||
        resolved.node.type !== item.type ||
        resolved.node.props.id !== id
      ) return false;
      if (!(await authorize(item))) return false;
      if (
        appStore.getState().permissions.getPermissions({ item }).edit !== true
      ) return false;
      if (!(await authorize(resolved.node))) return false;
      if (
        !valid() ||
        appStore.getState().permissions.getPermissions({ item: resolved.node })
          .edit !== true
      ) return false;
      const latest = appStore.getState();
      // Dispatch synchronously changes the snapshot this guard observes.
      unsubscribe();
      if (isRoot) {
        latest.dispatch({ type: "replaceRoot", root: toRoot(resolved.node), ui });
      } else {
        latest.dispatch({
          type: "replace",
          data: toComponent(resolved.node),
          destinationIndex: index!,
          destinationZone: zone!,
          ui,
        });
      }
      return true;
    })();
    return await Promise.race([work, interrupted]);
  } finally {
    unsubscribe();
    if (edits.get(id) === cancel) edits.delete(id);
  }
}

/**
 * Resolves the data of a component and replaces it in the appStore state.
 * @param currentData - The current data of the component to resolve.
 * @param getState - The function to get the current state of the appStore.
 * @param trigger - The trigger for resolving the data. Defaults to "force".
 * @param writeThrough - Whether to write through the resolved data even if it hasn't changed. Defaults to false.
 * @param ui - Optional UI state to set after replacing the component.
 * @returns A promise that resolves when the data has been replaced.
 */
export async function resolveAndReplaceData(
  currentData: ComponentData,
  getState: ReturnType<typeof useAppStoreApi>["getState"],
  trigger: ResolveDataTrigger = "force",
  writeThrough: boolean = false,
  ui?: Partial<UiState>,
) {
  const resolvedResult = await getState().resolveComponentData(
    currentData,
    trigger,
  );
  if (!resolvedResult.didChange && !writeThrough) return;

  const isRoot =
    resolvedResult.node.type === "root" ||
    resolvedResult.node.props.id === "root";

  if (isRoot) {
    getState().dispatch({
      type: "replaceRoot",
      root: toRoot(resolvedResult.node),
      ui,
    });
    return;
  }

  const itemSelector = getSelectorForId(
    getState().state,
    resolvedResult.node.props.id,
  );
  if (!itemSelector) {
    console.warn(
      `Warning: Could not find component with id "${currentData.props.id}" to resolve its data. Component may have been removed or the id is invalid.`,
    );
    return;
  }

  getState().dispatch({
    type: "replace",
    data: toComponent(resolvedResult.node),
    destinationIndex: itemSelector.index,
    destinationZone: itemSelector.zone,
    ui,
  });
}
