import { useAppStoreApi } from "../../store";
import { ComponentData, ResolveDataTrigger, UiState } from "../../types";

import { getSelectorForId } from "../get-selector-for-id";

import { toComponent } from "./to-component";
import { toRoot } from "./to-root";
import { setDeep } from "./set-deep";
import { deepEqual } from "fast-equals";
import { PermissionResolutionSupersededError } from "../../store/slices/permissions";

type AppStoreApi = ReturnType<typeof useAppStoreApi>;
type InlineEdit = {
  path: string;
  cancel: () => void;
  finishCommit: (candidate: ComponentData) => void;
};
type InlineQueue = {
  entries: Set<InlineEdit>;
  tail: Promise<void>;
  committing: boolean;
};
const inlineEdits = new WeakMap<AppStoreApi, Map<string, InlineQueue>>();

/**
 * Commit an inline edit only while its target and authorization remain current.
 * Different fields on the same component are resolved in submission order.
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
  let queues = inlineEdits.get(appStore);
  if (!queues) {
    queues = new Map();
    inlineEdits.set(appStore, queues);
  }
  let queue = queues.get(id);
  if (!queue) {
    queue = { entries: new Set(), tail: Promise.resolve(), committing: false };
    queues.set(id, queue);
  }
  const currentQueue = queue;
  const predecessor = queue.entries.size ? queue.tail : undefined;
  // Preserve fast supersession for consecutive edits to the same field. Do
  // not skip an earlier edit across an intervening edit to another field.
  if (!queue.committing && [...queue.entries].every((entry) => entry.path === path)) {
    queue.entries.forEach((entry) => entry.cancel());
  }

  let canceled = false;
  let cancelWait!: () => void;
  const interrupted = new Promise<false>((resolve) => {
    cancelWait = () => resolve(false);
  });
  const cancel = () => {
    canceled = true;
    cancelWait();
  };
  let initial = appStore.getState();
  let item = initial.state.indexes.nodes[id]?.data;
  const wildcardPath = path.replace(/\[\d+\]/g, "[*]");
  let permissionEntry = initial.permissions.cache[id];
  let permissionWasGranted = !!item && initial.permissions.getPermissions({ item }).edit === true;
  let commitEvents = 0;
  let commitPrevious: typeof initial | undefined;
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
  const unsubscribe = appStore.subscribe((state, previous) => {
    if (!valid()) {
      // A queued edit may follow this queue's own synchronous dispatch, but
      // must reject any intervening or reentrant state changes.
      if (
        currentQueue.committing &&
        !canceled && canEdit() &&
        state.config === initial.config &&
        state.permissions.globalPermissions === initial.permissions.globalPermissions
      ) {
        if (state.state !== previous.state) {
          commitEvents++;
          commitPrevious ??= previous;
        }
      } else {
        cancel();
        return;
      }
    }
    const permissions = appStore.getState().permissions;
    // A refresh invalidates the existing cache entry before replacing it.
    // Observe that transition so a later grant cannot revive this edit.
    if (!currentQueue.committing && item) {
      const granted = permissions.getPermissions({ item }).edit === true;
      if (permissionWasGranted && !granted) {
        cancel();
        return;
      }
      permissionWasGranted = granted;
    }
    const entry = permissions.cache[id];
    if (entry !== permissionEntry) {
      permissionEntry = entry;
      // A decision for another queued candidate is not a revocation of this
      // edit's committed target; each candidate is authorized before commit.
      if (
        entry?.lastData &&
        deepEqual(entry.lastData, item) &&
        permissions.getPermissions({ item: entry.lastData }).edit !== true
      ) cancel();
    }
  });
  const entry: InlineEdit = {
    path,
    cancel,
    finishCommit: (candidate) => {
      const current = appStore.getState();
      if (commitEvents === 0 && valid()) return;
      const node = current.state.indexes.nodes[id];
      const previousNode = initial.state.indexes.nodes[id];
      const previousZone = previousNode && `${previousNode.parentId}:${previousNode.zone}`;
      if (
        commitEvents !== 1 ||
        commitPrevious?.state.data !== initial.state.data ||
        commitPrevious?.state.ui !== initial.state.ui ||
        commitPrevious?.state.indexes.nodes[id]?.data !== item ||
        current.config !== initial.config ||
        current.permissions.globalPermissions !== initial.permissions.globalPermissions ||
        !canEdit() || canceled ||
        !node || !previousNode ||
        node.parentId !== previousNode.parentId || node.zone !== previousNode.zone ||
        (id !== "root" && previousZone &&
          current.state.indexes.zones[previousZone]?.contentIds.indexOf(id) !==
            initial.state.indexes.zones[previousZone]?.contentIds.indexOf(id)) ||
        (id === "root"
          ? node.data.type !== candidate.type ||
            !deepEqual(node.data.props, candidate.props) ||
            !deepEqual(node.data.readOnly, candidate.readOnly)
          : !deepEqual(node.data, candidate)) ||
        node.data.readOnly?.[path] || node.data.readOnly?.[wildcardPath]
      ) {
        cancel();
        return;
      }
      initial = current;
      item = node.data;
      permissionEntry = current.permissions.cache[id];
      permissionWasGranted = current.permissions.getPermissions({ item }).edit === true;
      commitEvents = 0;
      commitPrevious = undefined;
    },
  };
  currentQueue.entries.add(entry);
  let advance!: () => void;
  const completed = new Promise<void>((resolve) => { advance = resolve; });
  // Even a canceled waiter must not let later work overtake its predecessor.
  currentQueue.tail = predecessor ? predecessor.then(() => completed) : completed;

  const run = async (): Promise<boolean> => {
    if (predecessor) {
      const ready = await Promise.race([predecessor.then(() => true), interrupted]);
      if (!ready) return false;
    }
    const node = initial.state.indexes.nodes[id];
    const isRoot = id === "root" && item?.type === "root";
    const zone = node && `${node.parentId}:${node.zone}`;
    const index = zone
      ? initial.state.indexes.zones[zone]?.contentIds.indexOf(id)
      : -1;
    if (!item || (!isRoot && (index === undefined || index < 0)) || !valid())
      return false;
    const target = item;
    const authorize = async (candidate: ComponentData) => {
      await initial.permissions.resolvePermissions({ item: candidate });
      return (
        valid() &&
        appStore.getState().permissions.getPermissions({ item: candidate })
          .edit === true
      );
    };
    const work = (async () => {
      if (!(await authorize(target))) return false;
      const resolved = await initial.resolveComponentData(
        { ...target, props: setDeep(target.props, path, value) },
        "replace",
      );
      if (
        !valid() ||
        resolved.node.type !== target.type ||
        resolved.node.props.id !== id
      ) return false;
      if (!(await authorize(target))) return false;
      if (
        appStore.getState().permissions.getPermissions({ item: target }).edit !== true
      ) return false;
      const candidatePermissions = await appStore.getState().permissions.resolveCandidatePermissions(resolved.node);
      if (
        !valid() ||
        candidatePermissions?.permissions.edit !== true ||
        appStore.getState().permissions.getPermissions({ item: target }).edit !== true ||
        !candidatePermissions.isCurrent()
      ) return false;
      const latest = appStore.getState();
      // Dispatch synchronously changes the snapshot this guard observes.
      unsubscribe();
      currentQueue.committing = true;
      try {
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
      } finally {
        currentQueue.committing = false;
        currentQueue.entries.forEach((queued) => {
          if (queued !== entry) queued.finishCommit(resolved.node);
        });
      }
      return true;
    })();
    try {
      return await Promise.race([work, interrupted]);
    } catch (error) {
      if (error instanceof PermissionResolutionSupersededError) return false;
      throw error;
    }
  };
  const result = run().finally(() => {
    unsubscribe();
    currentQueue.entries.delete(entry);
    if (!currentQueue.entries.size && queues.get(id) === currentQueue) queues.delete(id);
    advance();
  });
  return result;
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
