import { deepEqual } from "fast-equals";
import { StoreApi } from "zustand";
import { AppStore } from "../../../../store";
import { ComponentData, Config, RootData, UiState } from "../../../../types";
import { stripSlots } from "../../../../lib/data/strip-slots";
import { mapFields } from "../../../../lib/data/map-fields";
import { getDeep } from "../../../../lib/data/get-deep";
import { setDeep } from "../../../../lib/data/set-deep";
import { toComponent } from "../../../../lib/data/to-component";

type Target = { kind: "root" } | { kind: "item"; id: string; type: string };

type Queue = {
  target: Target;
  snapshot: unknown;
  tail: Promise<void>;
  pending: number;
  valid: boolean;
  applying: boolean;
  slotRevision: number;
  arrayUiRevision: number;
  cancelPending: Set<() => void>;
  values: Map<
    string,
    {
      value: any;
      token: object;
      snapshot: NonNullable<ReturnType<typeof readTarget>>;
      slotRevision: number;
    }
  >;
  unsubscribe: () => void;
};

const queues = new WeakMap<StoreApi<AppStore>, Map<string, Queue>>();
const arrayUiChanges = new WeakMap<StoreApi<AppStore>, number>();

// The marker identifies the source of a synchronous notification, not a
// permission dependency. Any interrupted decision must be resolved again.
export const withArrayFieldUiChange = (
  appStore: StoreApi<AppStore>,
  callback: () => void,
) => {
  const depth = arrayUiChanges.get(appStore) ?? 0;
  arrayUiChanges.set(appStore, depth + 1);
  try {
    callback();
  } finally {
    if (depth) arrayUiChanges.set(appStore, depth);
    else arrayUiChanges.delete(appStore);
  }
};
type ArrayGuard = { path: string; expected: unknown };
type ArrayChange = {
  path: string;
  status: "pending" | "committed" | "failed";
  finished: Promise<void>;
  finish: () => void;
};
const arrayChanges = new WeakMap<
  StoreApi<AppStore>,
  Map<string, ArrayChange[]>
>();
const objectChanges = new WeakMap<
  StoreApi<AppStore>,
  {
    path: string;
    value?: any;
    update?: (value: any) => any;
    guards?: ArrayGuard[];
  }
>();

const pathsOverlap = (left: string, right: string) =>
  left === right ||
  left.startsWith(`${right}.`) ||
  left.startsWith(`${right}[`) ||
  right.startsWith(`${left}.`) ||
  right.startsWith(`${left}[`);

// Preserve the innermost object-field operation while it propagates through
// enclosing object/array handlers to the top-level Fields callback.
export const withObjectFieldChange = (
  appStore: StoreApi<AppStore>,
  path: string,
  value: any,
  callback: () => void,
) => {
  if (objectChanges.has(appStore)) return callback();
  objectChanges.set(appStore, { path, value });
  try {
    callback();
  } finally {
    objectChanges.delete(appStore);
  }
};

// Array actions must be replayed against the last committed value, so a
// rejected earlier edit cannot leak into a later add, removal, or reorder.
export const withArrayFieldChange = (
  appStore: StoreApi<AppStore>,
  path: string,
  update: (value: any) => any,
  callback: () => void,
  expected: unknown,
) => {
  if (objectChanges.has(appStore)) return callback();
  objectChanges.set(appStore, {
    path,
    update,
    guards: [{ path, expected }],
  });
  try {
    callback();
  } finally {
    objectChanges.delete(appStore);
  }
};

// Keep the innermost edit while recording each enclosing array whose item
// position it uses. This also covers object fields nested inside arrays.
export const withArrayItemChange = (
  appStore: StoreApi<AppStore>,
  arrayPath: string,
  expected: unknown,
  path: string,
  value: any,
  callback: () => void,
) => {
  const previous = objectChanges.get(appStore);
  objectChanges.set(appStore, {
    ...(previous ?? { path, value }),
    guards: [...(previous?.guards ?? []), { path: arrayPath, expected }],
  });
  try {
    callback();
  } finally {
    if (previous) objectChanges.set(appStore, previous);
    else objectChanges.delete(appStore);
  }
};

const slotsChangedInField = (
  before: ComponentData | RootData,
  after: ComponentData | RootData,
  fieldName: string,
  config: Config,
) => {
  const paths = new Set<string>();
  const collect = (item: ComponentData | RootData) => {
    mapFields(
      item,
      {
        slot: ({ propPath, value }) => {
          if (
            propPath === fieldName ||
            propPath.startsWith(`${fieldName}.`) ||
            propPath.startsWith(`${fieldName}[`) ||
            fieldName.startsWith(`${propPath}.`) ||
            fieldName.startsWith(`${propPath}[`)
          ) {
            paths.add(propPath);
          }
          return value;
        },
      },
      config,
      false,
      false,
    );
  };
  collect(before);
  collect(after);
  return [...paths].some((path) =>
    !deepEqual(
      getDeep(before.props ?? before, path),
      getDeep(after.props ?? after, path),
    ),
  );
};

// Object fields need the latest submitted value while an earlier edit is still
// resolving, even if a commit has since synchronized an older value to the UI.
export const getPendingFieldValue = (
  appStore: StoreApi<AppStore>,
  fieldName: string,
) => {
  const state = appStore.getState();
  const key =
    state.selectedItem && state.state.ui.itemSelector
      ? `item:${state.selectedItem.props.id}`
      : "root";
  const queue = queues.get(appStore)?.get(key);
  const pending = queue?.values.get(fieldName);
  if (!queue || !pending) return;
  const current = readTarget(state, queue.target);
  if (
    !current ||
    current.kind !== pending.snapshot.kind ||
    (queue.slotRevision !== pending.slotRevision &&
      slotsChangedInField(
        pending.snapshot.data,
        current.data,
        fieldName,
        state.config,
      ))
  ) {
    return;
  }
  return pending;
};

// Indexes can retain nodes that are no longer in their zone. Check both before
// treating an ID as the same live item.
const readTarget = (store: AppStore, target: Target) => {
  if (target.kind === "root") {
    return { kind: "root" as const, data: store.state.data.root };
  }

  const { nodes, zones } = store.state.indexes;
  const node = nodes[target.id];
  if (!node || node.data.type !== target.type) return undefined;
  const zone = zones[`${node.parentId}:${node.zone}`];
  if (!zone || !zone.contentIds.includes(target.id)) return undefined;
  return { kind: "item" as const, data: node.data };
};

export const createOnChange =
  (
    fieldName: string,
    appStore: StoreApi<AppStore>,
    onCancel: (message: string) => void = (message) => console.error(message),
  ) =>
  async (value: any, updatedUi?: Partial<UiState>) => {
    let canceled = false;
    let releaseCanceledEdit = () => {};
    const cancel = () => {
      if (canceled) return;
      canceled = true;
      releaseCanceledEdit();
      onCancel(
        "This edit was not applied because the field or its permissions changed. Please review the field and retry.",
      );
    };
    const initial = appStore.getState();
    const target: Target =
      initial.selectedItem && initial.state.ui.itemSelector
        ? {
            kind: "item",
            id: initial.selectedItem.props.id,
            type: initial.selectedItem.type,
          }
        : { kind: "root" };
    const key = target.kind === "root" ? "root" : `item:${target.id}`;
    let storeQueues = queues.get(appStore);
    if (!storeQueues) {
      storeQueues = new Map();
      queues.set(appStore, storeQueues);
    }

    let queue = storeQueues.get(key);
    if (!queue) {
      const snapshot = readTarget(initial, target);
      if (!snapshot) return cancel();
      queue = {
        target,
        snapshot,
        tail: Promise.resolve(),
        pending: 0,
        valid: true,
        applying: false,
        slotRevision: 0,
        arrayUiRevision: 0,
        cancelPending: new Set(),
        values: new Map(),
        unsubscribe: () => {},
      };
      const active = queue;
      const activeQueues = storeQueues;
      active.unsubscribe = appStore.subscribe((state, previousState) => {
        if (arrayUiChanges.has(appStore) && state.state.ui !== previousState.state.ui) {
          active.arrayUiRevision++;
        }
        const current = readTarget(state, active.target);
        const previous = active.snapshot as ReturnType<typeof readTarget>;
        if (
          state.config !== initial.config ||
          state.permissions.globalPermissions !==
            initial.permissions.globalPermissions
        ) {
          active.valid = false;
        } else if (active.applying && current) {
          active.snapshot = current;
        } else if (deepEqual(current, previous)) {
          return;
        } else if (
          current &&
          previous &&
          current.kind === previous.kind &&
          deepEqual(
            stripSlots(current.data, state.config),
            stripSlots(previous.data, state.config),
          )
        ) {
          active.slotRevision++;
          active.snapshot = current;
        } else if (!current || !deepEqual(current, active.snapshot)) {
          active.valid = false;
        }
        if (!active.valid) {
          active.unsubscribe();
          if (activeQueues.get(key) === active) activeQueues.delete(key);
          for (const cancelPending of active.cancelPending) cancelPending();
        }
      });
      storeQueues.set(key, active);
    }

    const active = queue;
    const activeQueues = storeQueues;
    const initialTarget = readTarget(initial, target);
    if (!initialTarget) return cancel();
    active.cancelPending.add(cancel);
    const initialSlotRevision = active.slotRevision;
    const objectChange = objectChanges.get(appStore);
    const patch =
      objectChange &&
      (objectChange.path === fieldName ||
        objectChange.path.startsWith(`${fieldName}.`) ||
        objectChange.path.startsWith(`${fieldName}[`))
        ? objectChange
        : undefined;
    const guards = patch?.guards ?? [];
    let storeArrayChanges = arrayChanges.get(appStore);
    if (!storeArrayChanges) {
      storeArrayChanges = new Map();
      arrayChanges.set(appStore, storeArrayChanges);
    }
    const arrayKey = target.kind === "item" ? `${key}:${target.type}` : key;
    const changes = storeArrayChanges.get(arrayKey) ?? [];
    storeArrayChanges.set(arrayKey, changes);
    const dependencies = changes
      .filter((change) =>
        guards.some((guard) => pathsOverlap(guard.path, change.path)),
      )
      .map((change) => ({ change, wasPending: change.status === "pending" }));
    let structural: ArrayChange | undefined;
    if (patch?.update) {
      let finish!: () => void;
      const finished = new Promise<void>((resolve) => { finish = resolve; });
      structural = { path: patch.path, status: "pending", finished, finish };
      changes.push(structural);
    }
    const applyValue = (props: Record<string, any>) =>
      patch
        ? setDeep(
            props,
            patch.path,
            patch.update ? patch.update(getDeep(props, patch.path)) : patch.value,
          )
        : { ...props, [fieldName]: value };
    active.pending++;
    const token = {};
    active.values.set(fieldName, {
      value,
      token,
      snapshot: initialTarget,
      slotRevision: initialSlotRevision,
    });
    releaseCanceledEdit = () => {
      if (structural?.status === "pending") {
        structural.status = "failed";
        structural.finish();
      }
      if (active.values.get(fieldName)?.token === token) {
        active.values.delete(fieldName);
      }
    };
    const operation = active.tail.then(async () => {
      if (!active.valid) return cancel();
      const unfinished = dependencies
        .filter(({ change }) => change.status === "pending")
        .map(({ change }) => change.finished);
      if (unfinished.length) await Promise.all(unfinished);
      if (!active.valid) return cancel();
      const current = appStore.getState();
      const data = readTarget(current, active.target);
      if (!data) return cancel();

      // A decision is valid only for the exact target, policy and public app
      // state used by the permissions resolver. Cache entries for current and
      // proposed data share an ID, so inspect each immediately after resolving.
      const bindingIsCurrent = (binding: {
        config: AppStore["config"];
        global: AppStore["permissions"]["globalPermissions"];
        data: AppStore["state"]["data"];
        ui: AppStore["state"]["ui"];
        target: NonNullable<ReturnType<typeof readTarget>>;
        arrayUiRevision: number;
      }) => {
        const latest = appStore.getState();
        return (
          !canceled &&
          active.valid &&
          latest.config === binding.config &&
          latest.permissions.globalPermissions === binding.global &&
          latest.state.data === binding.data &&
          latest.state.ui === binding.ui &&
          deepEqual(readTarget(latest, active.target), binding.target)
        );
      };
      type Binding = Parameters<typeof bindingIsCurrent>[0];
      const retryArrayUiChange = (binding: Binding) => {
        const latest = appStore.getState();
        return (
          !canceled &&
          active.valid &&
          active.arrayUiRevision !== binding.arrayUiRevision &&
          latest.config === binding.config &&
          latest.permissions.globalPermissions === binding.global &&
          latest.state.data === binding.data &&
          deepEqual(readTarget(latest, active.target), binding.target)
        );
      };
      const retry = Symbol("retry array UI authorization");
      const permissionItem = (input: ComponentData | RootData) =>
        active.target.kind === "root"
          ? toComponent({
              props: { ...(input.props ?? input) },
              ...(input.readOnly ? { readOnly: input.readOnly } : {}),
            })
          : (input as ComponentData);
      const authorize = async (
        candidate?: ComponentData | RootData,
        expected?: Binding,
      ): Promise<Binding | typeof retry | undefined> => {
        const before = appStore.getState();
        const targetData = readTarget(before, active.target);
        if (!active.valid || !targetData) return;
        if (expected && !bindingIsCurrent(expected)) {
          return retryArrayUiChange(expected) ? retry : undefined;
        }
        const snapshot = {
          config: before.config,
          global: before.permissions.globalPermissions,
          data: before.state.data,
          ui: before.state.ui,
          target: targetData,
          arrayUiRevision: active.arrayUiRevision,
        };
        const input = candidate ?? targetData.data;
        const item = permissionItem(input);
        if (
          active.target.kind === "item" &&
          (item.type !== active.target.type || item.props.id !== active.target.id)
        ) return;
        if (!candidate && input.readOnly?.[fieldName]) return;
        if (
          expected &&
          before.permissions.getPermissions({ item: permissionItem(targetData.data) })
            .edit !== true
        )
          return;
        // Report a superseded decision even if the resolver never settles.
        let interrupt!: () => void;
        const interrupted = new Promise<typeof retry>((resolve) => {
          interrupt = () => resolve(retry);
        });
        const unsubscribe = appStore.subscribe(() => {
          if (bindingIsCurrent(snapshot)) return;
          unsubscribe();
          if (arrayUiChanges.has(appStore) && retryArrayUiChange(snapshot)) {
            interrupt();
            return;
          }
          active.valid = false;
          active.unsubscribe();
          if (activeQueues.get(key) === active) activeQueues.delete(key);
          for (const cancelPending of active.cancelPending) cancelPending();
        });
        try {
          const result = await Promise.race([
            before.permissions.resolvePermissions({ item }),
            interrupted,
          ]);
          if (result === retry) return retry;
        } finally {
          unsubscribe();
        }
        const latest = appStore.getState();
        if (!bindingIsCurrent(snapshot)) {
          return retryArrayUiChange(snapshot) ? retry : undefined;
        }
        if (expected && !bindingIsCurrent(expected)) {
          return retryArrayUiChange(expected) ? retry : undefined;
        }
        if (latest.permissions.getPermissions({ item }).edit !== true) return;
        return snapshot;
      };

      for (const { change, wasPending } of dependencies) {
        if (change.status !== "failed") continue;
        const overlapping = guards.filter((guard) =>
          pathsOverlap(guard.path, change.path),
        );
        const props = data.data.props ?? data.data;
        if (
          wasPending ||
          overlapping.some(
            (guard) => !deepEqual(guard.expected, getDeep(props, guard.path)),
          )
        ) {
          const message =
            "Puck could not apply an array edit because an earlier array change failed; refresh the field and retry.";
          // Field callbacks are void-valued; surface the rejection even when a
          // UI handler does not retain the promise returned by createOnChange.
          console.error(message);
          throw new Error(message);
        }
        const index = changes.indexOf(change);
        if (index !== -1) changes.splice(index, 1);
      }

      if (active.target.kind === "item" && data.kind === "item") {
        if (
          initialTarget?.kind === "item" &&
          initialSlotRevision !== active.slotRevision &&
          slotsChangedInField(
            initialTarget.data,
            data.data,
            patch?.path ?? fieldName,
            current.config,
          )
        ) {
          return cancel();
        }
        let input = data.data;
        let resolved;
        while (true) {
          const authorization = await authorize();
          if (authorization === retry) continue;
          if (authorization && !bindingIsCurrent(authorization) && retryArrayUiChange(authorization)) continue;
          if (
            !authorization ||
            !bindingIsCurrent(authorization) ||
            !deepEqual(authorization.target.data, input)
          ) return cancel();
          const revision = active.slotRevision;
          resolved = await current.resolveComponentData(
            { ...input, props: applyValue(input.props) },
            "replace",
          );
          if (!active.valid) return cancel();
          if (revision === active.slotRevision) break;
          const latestTarget = readTarget(appStore.getState(), active.target);
          if (!latestTarget || latestTarget.kind !== "item") return cancel();
          // Only overlapping paths conflict. A leaf patch can be replayed
          // without replacing a sibling slot inside the same object field.
          if (
            slotsChangedInField(
              input,
              latestTarget.data,
              patch?.path ?? fieldName,
              current.config,
            )
          ) {
            return cancel();
          }
          input = latestTarget.data;
        }
        if (!active.valid) return cancel();
        while (true) {
          const authorization = await authorize();
          if (authorization === retry) continue;
          if (!authorization) return cancel();
          if (!bindingIsCurrent(authorization)) {
            if (retryArrayUiChange(authorization)) continue;
            return cancel();
          }
          if (!deepEqual(authorization.target.data, input)) return cancel();
          const candidateAuthorization = await authorize(resolved.node, authorization);
          if (candidateAuthorization === retry) continue;
          if (!candidateAuthorization) return cancel();
          if (!bindingIsCurrent(authorization)) {
            if (retryArrayUiChange(authorization)) continue;
            return cancel();
          }
          if (appStore.getState().permissions.getPermissions({
            item: permissionItem(resolved.node),
          }).edit !== true) return cancel();
          break;
        }
        const latest = appStore.getState();
        const node = latest.state.indexes.nodes[active.target.id];
        const zone = node && `${node.parentId}:${node.zone}`;
        const index = zone
          ? latest.state.indexes.zones[zone]?.contentIds.indexOf(
              active.target.id,
            )
          : undefined;
        if (!zone || index === undefined || index < 0) return cancel();
        active.applying = true;
        try {
          latest.dispatch({
            type: "replace",
            destinationIndex: index,
            destinationZone: zone,
            data: resolved.node,
            ui: updatedUi,
          });
          if (structural) structural.status = "committed";
        } finally {
          active.applying = false;
        }
        return;
      }

      if (active.target.kind === "root" && data.kind === "root") {
        if (
          initialTarget?.kind === "root" &&
          initialSlotRevision !== active.slotRevision &&
          slotsChangedInField(
            initialTarget.data,
            data.data,
            patch?.path ?? fieldName,
            current.config,
          )
        ) {
          return cancel();
        }
        let input = data.data;
        let newProps;
        let resolved;
        while (true) {
          const authorization = await authorize();
          if (authorization === retry) continue;
          if (authorization && !bindingIsCurrent(authorization) && retryArrayUiChange(authorization)) continue;
          if (
            !authorization ||
            !bindingIsCurrent(authorization) ||
            !deepEqual(authorization.target.data, input)
          ) return cancel();
          const revision = active.slotRevision;
          newProps = applyValue(input.props || input);
          resolved = input.props
            ? await current.resolveComponentData(
                { ...input, props: newProps },
                "replace",
              )
            : null;
          if (!active.valid) return cancel();
          if (revision === active.slotRevision) break;
          const latestTarget = readTarget(appStore.getState(), active.target);
          if (!latestTarget || latestTarget.kind !== "root") return cancel();
          if (
            slotsChangedInField(
              input,
              latestTarget.data,
              patch?.path ?? fieldName,
              current.config,
            )
          ) {
            return cancel();
          }
          input = latestTarget.data;
        }
        if (!active.valid) return cancel();
        const candidate = resolved ? resolved.node : newProps;
        while (true) {
          const authorization = await authorize();
          if (authorization === retry) continue;
          if (!authorization) return cancel();
          if (!bindingIsCurrent(authorization)) {
            if (retryArrayUiChange(authorization)) continue;
            return cancel();
          }
          if (!deepEqual(authorization.target.data, input)) return cancel();
          const candidateAuthorization = await authorize(candidate, authorization);
          if (candidateAuthorization === retry) continue;
          if (!candidateAuthorization) return cancel();
          if (!bindingIsCurrent(authorization)) {
            if (retryArrayUiChange(authorization)) continue;
            return cancel();
          }
          if (appStore.getState().permissions.getPermissions({
            item: permissionItem(candidate),
          }).edit !== true) return cancel();
          break;
        }
        const latest = appStore.getState();
        active.applying = true;
        try {
          if (resolved) {
            latest.dispatch({
              type: "replaceRoot",
              root: resolved.node,
              ui: { ...latest.state.ui, ...updatedUi },
              recordHistory: true,
            });
          } else {
            latest.dispatch({ type: "setData", data: { root: newProps } });
          }
          if (structural) structural.status = "committed";
        } finally {
          active.applying = false;
        }
      }
    });
    active.tail = operation.catch(() => {});
    try {
      await operation;
    } finally {
      active.cancelPending.delete(cancel);
      if (structural) {
        if (structural.status === "pending") structural.status = "failed";
        if (structural.status === "committed") {
          const index = changes.indexOf(structural);
          if (index !== -1) changes.splice(index, 1);
        }
        structural.finish();
      }
      if (!changes.length && storeArrayChanges.get(arrayKey) === changes) {
        storeArrayChanges.delete(arrayKey);
      }
      active.pending--;
      if (active.values.get(fieldName)?.token === token) {
        active.values.delete(fieldName);
      }
      if (!active.pending) {
        active.unsubscribe();
        if (activeQueues.get(key) === active) activeQueues.delete(key);
      }
    }
  };
