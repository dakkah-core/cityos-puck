import { useEffect } from "react";
import { flattenData } from "../../lib/data/flatten-data";
import {
  AppState,
  ComponentData,
  Config,
  Permissions,
  RootData,
  UserGenerics,
} from "../../types";
import { getChanged } from "../../lib/get-changed";
import { AppStore, useAppStoreApi } from "../";
import { makeStatePublic } from "../../lib/data/make-state-public";
import { toComponent } from "../../lib/data/to-component";
import { deepEqual } from "fast-equals";

// AppState is updated immutably. Reference checks avoid traversing arbitrary
// UI metadata and component data on every resolver invocation.
const sameAppState = (left: AppState, right: AppState) =>
  left.data === right.data && left.ui === right.ui;

// A dynamic resolver is the source of the item decision. Until it has
// returned for the current policy, do not expose optimistic control grants.
const unresolvedPermissions = (permissions: Permissions): Permissions =>
  Object.fromEntries(
    Object.keys(permissions).map((permission) => [permission, false]),
  ) as Permissions;

// Match the root shape exposed by walkAppState, including legacy unwrapped props.
const rootPermissionItem = (root: RootData): ComponentData => {
  const item = toComponent({ props: { ...(root.props ?? root) } });
  if (root.readOnly) item.readOnly = root.readOnly;
  return item;
};

type PermissionsArgs<
  UserConfig extends Config = Config,
  G extends UserGenerics<UserConfig> = UserGenerics<UserConfig>,
> = {
  item?: G["UserComponentData"] | null;
  type?: keyof G["UserProps"];
  root?: boolean;
};

export type GetPermissions<UserConfig extends Config = Config> = (
  params?: PermissionsArgs<UserConfig>,
) => Permissions;

type ResolvePermissions<UserConfig extends Config = Config> = (
  params?: PermissionsArgs<UserConfig>,
  force?: boolean,
) => Promise<void>;

export type RefreshPermissions<UserConfig extends Config = Config> = (
  params?: PermissionsArgs<UserConfig>,
  force?: boolean,
) => Promise<void>;

// A rejected request did not complete with a current decision. Callers may retry
// against the latest inputs; the replacement request remains independent.
export class PermissionResolutionSupersededError extends Error {
  readonly code = "PUCK_PERMISSION_SUPERSEDED";

  constructor() {
    super("Permission resolution was superseded before completion.");
    this.name = "PermissionResolutionSupersededError";
  }
}

type Cache = Record<
  string,
  {
    lastPermissions: Partial<Permissions>;
    lastData: ComponentData | null;
    lastParentId: string | null | undefined;
  }
>;

export type PermissionsSlice = {
  cache: Cache;
  globalPermissions: Permissions;
  resolvedPermissions: Record<string, Partial<Permissions> | undefined>;
  getPermissions: GetPermissions<Config>;
  resolvePermissions: ResolvePermissions<Config>;
  refreshPermissions: RefreshPermissions<Config>;
  resolveCandidatePermissions: (item: ComponentData) => Promise<
    { permissions: Permissions; isCurrent: () => boolean } | undefined
  >;
};

export const createPermissionsSlice = (
  set: (newState: Partial<AppStore>) => void,
  get: () => AppStore,
  registerInvalidation: (invalidate: () => void) => void = () => {},
  registerItemLifetime: (
    observe: (id: string, previous: ComponentData | undefined, current: ComponentData | undefined) => void,
  ) => void = () => {},
): PermissionsSlice => {
  const pending = new Map<
    string,
    {
      item: ComponentData;
      parentId: string | null | undefined;
      config: Config;
      globalPermissions: Permissions;
      resolver: unknown;
      appState: AppState;
      parent: ComponentData | null;
      cleanup: () => void;
      completion: Promise<void>;
      reject: (reason: unknown) => void;
      starting: boolean;
      invokingResolver: boolean;
    }
  >();
  // An older grant must not reappear while a newer decision is pending or
  // after that decision fails. Entries are weakly held so discarded item
  // caches do not leave a separate permanent set of identifiers.
  const invalidEntries = new WeakSet<Cache[string]>();
  // The first request may fail before an entry exists to invalidate.
  const invalidCommitted = new WeakSet<ComponentData>();
  // A new committed-item request invalidates in-flight candidate decisions,
  // even when a refresh subsequently restores the same permissions.
  const requestVersions = new WeakMap<ComponentData, number>();
  const candidateVersions = new WeakMap<ComponentData, number>();
  // New or restored indexed items require a committed decision. Weak keys
  // follow the indexed object instead of retaining removed identifiers.
  const unresolvedLifetime = new WeakSet<ComponentData>();
  const resetHistoryEntries = new WeakSet<Cache[string]>();
  // An uncommitted node has no stable object in the index to key a weak map.
  let permissionRequestGeneration = 0;
  // Absent candidates have no committed object on which to track a lifetime.
  let itemLifetimeGeneration = 0;
  let itemRemovalGeneration = 0;
  const candidateCache = new WeakMap<ComponentData, {
    item: ComponentData;
    permissions: Permissions;
    isCurrent: () => boolean;
  }>();
  const cancelPending = (id: string) => {
    const request = pending.get(id);
    if (!request) return;
    pending.delete(id);
    request.reject(new PermissionResolutionSupersededError());
    // Resolution may be triggered by a synchronous store subscriber.
    queueMicrotask(() => request.cleanup());
  };
  registerItemLifetime((id, previous, current) => {
    if (previous && current) {
      if (unresolvedLifetime.has(previous)) unresolvedLifetime.add(current);
      return;
    }
    itemLifetimeGeneration++;
    if (previous) itemRemovalGeneration++;
    if (current) unresolvedLifetime.add(current);
    if (previous) {
      requestVersions.set(previous, (requestVersions.get(previous) ?? 0) + 1);
      candidateVersions.set(previous, (candidateVersions.get(previous) ?? 0) + 1);
      invalidCommitted.add(previous);
      candidateCache.delete(previous);
    }
    const entry = get().permissions.cache[id];
    if (entry) {
      invalidEntries.add(entry);
      resetHistoryEntries.add(entry);
    }
    cancelPending(id);
  });
  let policyGeneration = 0;
  registerInvalidation(() => {
    const obsolete = [...pending.values()];
    pending.clear();
    policyGeneration++;
    obsolete.forEach((request) =>
      request.reject(new PermissionResolutionSupersededError()),
    );
    // Invalidation is called by a store subscriber; clean up after the
    // current notification instead of issuing nested store notifications.
    queueMicrotask(() => obsolete.forEach((request) => request.cleanup()));
  });
  const cacheInputs = new WeakMap<
    Cache[string],
    {
      config: Config;
      globalPermissions: Permissions;
      resolver: unknown;
      generation: number;
      appState: AppState;
      parent: ComponentData | null;
    }
  >();

  const resolvePermissions: ResolvePermissions = async (params = {}, force) => {
    const { state, config } = get();

    const resolvePermissionsForItem = async (
      item: ComponentData,
      force: boolean = false,
    ): Promise<void> => {
      permissionRequestGeneration++;
      const committed = get().state.indexes.nodes[item.props.id]?.data;
      const lifetimeGeneration = itemLifetimeGeneration;
      const removalGeneration = itemRemovalGeneration;
      if (committed) {
        requestVersions.set(committed, (requestVersions.get(committed) ?? 0) + 1);
      }
      const {
        config,
        state: appState,
        setComponentLoading,
        permissions,
      } = get();
      const { globalPermissions } = permissions;
      const itemCache: Cache[string] | undefined =
        permissions.cache[item.props.id];
      const previousCache = itemCache && !resetHistoryEntries.has(itemCache) ? itemCache : undefined;
      const nodes = appState.indexes.nodes;
      const parentId = nodes[item.props.id]?.parentId;
      const parentNode = parentId ? nodes[parentId] : null;
      const parentData = parentNode?.data ?? null;
      const publicState = makeStatePublic(appState);

      const componentConfig =
        item.type === "root" ? config.root : config.components[item.type];

      if (!componentConfig) {
        cancelPending(item.props.id);
        return;
      }

      const initialPermissions = {
        ...globalPermissions,
        ...componentConfig.permissions,
      };

      if (componentConfig.resolvePermissions) {
        const resolveForItem = componentConfig.resolvePermissions;
        const changed = getChanged(item, previousCache?.lastData);
        const itemChanged = !deepEqual(item, itemCache?.lastData);
        const parentChanged = itemCache?.lastParentId !== parentId;
        const inputs = itemCache && cacheInputs.get(itemCache);
        const inputsChanged =
          !inputs ||
          (itemCache && invalidEntries.has(itemCache)) ||
          (committed && unresolvedLifetime.has(committed)) ||
          inputs.config !== config ||
          inputs.globalPermissions !== globalPermissions ||
          inputs.generation !== policyGeneration ||
          !sameAppState(inputs.appState, publicState) ||
          !deepEqual(inputs.parent, parentData) ||
          inputs.resolver !== componentConfig.resolvePermissions;

        const existing = pending.get(item.props.id);
        // Avoid recursive resolver calls while ensuring a forced reentry does
        // not reuse external policy already captured by the running resolver.
        if (force && existing?.invokingResolver) {
          await Promise.resolve();
          if (pending.get(item.props.id) !== existing) {
            throw new PermissionResolutionSupersededError();
          }
          return resolvePermissionsForItem(item, true);
        }
        if (
          existing &&
          (!force || existing.starting) &&
          deepEqual(existing.item, item) &&
          existing.parentId === parentId &&
          existing.config === config &&
          existing.globalPermissions === globalPermissions &&
          existing.resolver === componentConfig.resolvePermissions &&
          sameAppState(existing.appState, publicState) &&
          deepEqual(existing.parent, parentData)
        ) {
          await existing.completion;
          return;
        }

        if (
          itemChanged ||
          parentChanged ||
          itemCache?.lastData?.type !== item.type ||
          inputsChanged ||
          force
        ) {
          cancelPending(item.props.id);
          if (itemCache) invalidEntries.add(itemCache);
          if (committed) invalidCommitted.add(committed);
          let complete!: () => void;
          let fail!: (reason: unknown) => void;
          const completion = new Promise<void>((resolve, reject) => {
            complete = resolve;
            fail = reject;
          });
          const request = {
            item,
            parentId,
            config,
            globalPermissions,
            resolver: componentConfig.resolvePermissions,
            appState: publicState,
            parent: parentData,
            cleanup: () => {},
            completion,
            reject: fail,
            starting: true,
            invokingResolver: false,
          };
          // Register before loading and the host callback: both can notify
          // subscribers synchronously and reenter permission resolution.
          pending.set(item.props.id, request);

          const work = (async () => {
            try {
              const clearLoading = setComponentLoading(item.props.id, true, 50);
              let cleaned = false;
              request.cleanup = () => {
                if (cleaned) return;
                cleaned = true;
                clearLoading();
              };
              // Loading bookkeeping notifies subscribers synchronously; a host
              // may replace the policy during that notification.
              const afterLoading = get();
              if (
                pending.get(item.props.id) !== request ||
                afterLoading.config !== config ||
                afterLoading.permissions.globalPermissions !== globalPermissions ||
                !sameAppState(makeStatePublic(afterLoading.state), publicState) ||
                (item.type === "root"
                  ? afterLoading.config.root?.resolvePermissions
                  : afterLoading.config.components[item.type]?.resolvePermissions) !==
                  resolveForItem
              ) {
                throw new PermissionResolutionSupersededError();
              }
              request.starting = false;
              request.invokingResolver = true;
              let decision: ReturnType<typeof resolveForItem>;
              try {
                decision = resolveForItem(item, {
                  changed,
                  lastPermissions: previousCache?.lastPermissions || null,
                  permissions: initialPermissions,
                  appState: publicState,
                  lastData: previousCache?.lastData || null,
                  parent: parentData,
                });
              } finally {
                request.invokingResolver = false;
              }
              const resolvedPermissions = await decision;

              const latestState = get();
              const latestParentId =
                latestState.state.indexes.nodes[item.props.id]?.parentId;
              const latestParent = latestParentId
                ? latestState.state.indexes.nodes[latestParentId]?.data ?? null
                : null;
              if (
                pending.get(item.props.id) !== request ||
                latestState.config !== config ||
                latestState.permissions.globalPermissions !== globalPermissions ||
                latestParentId !== parentId ||
                !deepEqual(latestParent, parentData) ||
                !sameAppState(makeStatePublic(latestState.state), publicState) ||
                (item.type === "root"
                  ? latestState.config.root?.resolvePermissions
                  : latestState.config.components[item.type]?.resolvePermissions) !==
                  request.resolver
              ) {
                throw new PermissionResolutionSupersededError();
              }

              const latest = latestState.permissions;
              const entry = {
                lastParentId: parentId,
                lastData: item,
                lastPermissions: resolvedPermissions,
              };
              cacheInputs.set(entry, {
                config,
                globalPermissions,
                resolver: componentConfig.resolvePermissions,
                generation: policyGeneration,
                appState: publicState,
                parent: parentData,
              });

              if (committed) {
                invalidCommitted.delete(committed);
                if (
                  latestState.state.indexes.nodes[item.props.id]?.data === committed &&
                  deepEqual(item, committed)
                ) {
                  unresolvedLifetime.delete(committed);
                }
              }

              set({
                permissions: {
                  ...latest,
                  cache: {
                    ...latest.cache,
                    [item.props.id]: entry,
                  },
                  resolvedPermissions: {
                    ...latest.resolvedPermissions,
                    [item.props.id]: resolvedPermissions,
                  },
                },
              });
            } finally {
              // Cleanup notifies subscribers synchronously. Keep the request
              // registered until afterward so a reentrant refresh can
              // supersede its completion.
              try {
                request.cleanup();
              } finally {
                if (pending.get(item.props.id) === request) {
                  pending.delete(item.props.id);
                }
              }
            }
          })();
          void work.then(() => {
            if (
              item.type !== "root" && (
                itemRemovalGeneration !== removalGeneration ||
                (!committed && itemLifetimeGeneration !== lifetimeGeneration)
              )
            ) {
              fail(new PermissionResolutionSupersededError());
            } else {
              complete();
            }
          }, fail);
          await completion;
        } else {
          // Returning to the accepted input must supersede a different
          // pending input, even though no new resolver needs to run.
          const request = pending.get(item.props.id);
          if (
            request &&
            (!deepEqual(request.item, item) ||
              request.parentId !== parentId ||
              request.config !== config ||
              request.globalPermissions !== globalPermissions ||
              !sameAppState(request.appState, publicState) ||
              !deepEqual(request.parent, parentData) ||
              request.resolver !== componentConfig.resolvePermissions)
          ) {
            cancelPending(item.props.id);
          }
        }
      } else {
        cancelPending(item.props.id);
      }
    };

    const resolvePermissionsForRoot = (force = false) => {
      const { state: appState } = get();

      return resolvePermissionsForItem(
        // Shim the root data in by conforming to component data shape
        rootPermissionItem(appState.data.root),
        force,
      );
    };

    const { item, type, root } = params;

    if (item) {
      // Resolve specific item
      await resolvePermissionsForItem(item, force);
    } else if (type) {
      // Resolve specific type
      await Promise.all(
        flattenData(state, config)
          .filter((item) => item.type === type)
          .map((item) => resolvePermissionsForItem(item, force)),
      );
    } else if (root) {
      await resolvePermissionsForRoot(force);
    } else {
      // Resolve everything
      await Promise.all(
        flattenData(state, config).map((item) =>
          resolvePermissionsForItem(item, force),
        ),
      );
    }
  };

  const resolveCandidatePermissions: PermissionsSlice["resolveCandidatePermissions"] = async (item) => {
    const before = get();
    if (before.fields.policyPending) return undefined;
    const fieldPolicyRevision = before.fields.policyRevision;
    const { config, state, permissions } = before;
    const id = item.props.id;
    const node = state.indexes.nodes[id];
    if (node && node.data.type !== item.type) return undefined;
    const committed = node?.data;
    const parentId = node?.parentId;
    const parent = parentId ? state.indexes.nodes[parentId]?.data ?? null : null;
    const componentConfig = item.type === "root" ? config.root : config.components[item.type];
    // Root configuration is optional, but a component type must be registered.
    if (item.type !== "root" &&
        (!Object.prototype.hasOwnProperty.call(config.components, item.type) || !componentConfig)) {
      return undefined;
    }
    const resolver = componentConfig?.resolvePermissions;
    const entry = permissions.cache[id];
    const previousEntry = entry && !resetHistoryEntries.has(entry) ? entry : undefined;
    // A candidate cannot outlive a committed decision that is already being
    // refreshed or has failed. A request version alone only detects refreshes
    // that start after the candidate.
    if (committed && (pending.has(id) || (resolver && (
      unresolvedLifetime.has(committed) || invalidCommitted.has(committed) || (entry && invalidEntries.has(entry))
    )))) {
      return undefined;
    }
    const decision = permissions.resolvedPermissions[id];
    const version = committed ? requestVersions.get(committed) ?? 0 : 0;
    const candidateVersion = committed ? candidateVersions.get(committed) ?? 0 : 0;
    const requestGeneration = permissionRequestGeneration;
    const lifetimeGeneration = itemLifetimeGeneration;
    const generation = policyGeneration;
    const publicState = makeStatePublic(state);
    const initialPermissions = { ...permissions.globalPermissions, ...componentConfig?.permissions } as Permissions;

    const resolved = resolver
      ? await resolver(item, {
          changed: getChanged(item, previousEntry?.lastData),
          lastPermissions: previousEntry?.lastPermissions || null,
          permissions: initialPermissions,
          appState: publicState,
          lastData: previousEntry?.lastData || null,
          parent,
        })
      : {};

    const isCurrent = () => {
      const latest = get();
      const latestNode = latest.state.indexes.nodes[id];
      const latestParent = latestNode?.parentId
        ? latest.state.indexes.nodes[latestNode.parentId]?.data ?? null
        : null;
      const latestComponentConfig = item.type === "root"
        ? latest.config.root
        : latest.config.components[item.type];
      return (
        !latest.fields.policyPending &&
        latest.fields.policyRevision === fieldPolicyRevision &&
        latest.config === config &&
        latestComponentConfig === componentConfig &&
        (item.type === "root" || Object.prototype.hasOwnProperty.call(latest.config.components, item.type)) &&
        latest.permissions.globalPermissions === permissions.globalPermissions &&
        policyGeneration === generation &&
        (!committed || (requestVersions.get(committed) ?? 0) === version) &&
        (!committed || (candidateVersions.get(committed) ?? 0) === candidateVersion) &&
        (committed || permissionRequestGeneration === requestGeneration) &&
        (committed || item.type === "root" || itemLifetimeGeneration === lifetimeGeneration) &&
        (!committed || (!pending.has(id) && (!resolver || (
          !unresolvedLifetime.has(committed) && !invalidCommitted.has(committed) && (!entry || !invalidEntries.has(entry))
        )))) &&
        latest.permissions.cache[id] === entry &&
        latest.permissions.resolvedPermissions[id] === decision &&
        sameAppState(makeStatePublic(latest.state), publicState) &&
        latestNode?.data === committed && latestNode?.parentId === parentId &&
        deepEqual(latestParent, parent) &&
        deepEqual(initialPermissions, {
          ...latest.permissions.globalPermissions,
          ...(item.type === "root" ? latest.config.root?.permissions : latest.config.components[item.type]?.permissions),
        }) &&
        (item.type === "root" ? latest.config.root?.resolvePermissions : latest.config.components[item.type]?.resolvePermissions) === resolver
      );
    };
    return isCurrent() ? { permissions: { ...initialPermissions, ...resolved }, isCurrent } : undefined;
  };

  const refreshPermissions: RefreshPermissions = async (params) => {
    const item = params?.item;
    const current = item && get().state.indexes.nodes[item.props.id]?.data;
    if (item && current && item.type === current.type && !deepEqual(item, current)) {
      // Data resolution refreshes proposed nodes before they are committed.
      // Publish their decision separately while retaining the public ability
      // to query it with getPermissions({ item }). A newer refresh invalidates
      // the old candidate decision before invoking the host resolver.
      const version = (candidateVersions.get(current) ?? 0) + 1;
      candidateVersions.set(current, version);
      if (candidateCache.delete(current)) {
        set({ permissions: { ...get().permissions } });
      }
      const result = await resolveCandidatePermissions(item);
      if (!result || !result.isCurrent() || candidateVersions.get(current) !== version) {
        throw new PermissionResolutionSupersededError();
      }
      candidateCache.set(current, { item, ...result });
      set({ permissions: { ...get().permissions } });
      if (!result.isCurrent() || candidateVersions.get(current) !== version) {
        throw new PermissionResolutionSupersededError();
      }
      return;
    }
    await resolvePermissions(params, true);
  };

  return {
    cache: {},
    globalPermissions: {
      drag: true,
      edit: true,
      delete: true,
      duplicate: true,
      insert: true,
    },
    resolvedPermissions: {},
    resolveCandidatePermissions,
    getPermissions: ({ item, type, root } = {}) => {
      const { config, permissions, state } = get();
      const { globalPermissions, resolvedPermissions } = permissions;

      // A failed or in-flight field-policy refresh must not expose stale
      // field or slot grants. A successful refresh releases this gate.
      if (get().fields.policyPending) return unresolvedPermissions(globalPermissions);

      if (item && item.type !== "root") {
        const componentConfig = config.components[item.type];
        if (!Object.prototype.hasOwnProperty.call(config.components, item.type) || !componentConfig) {
          return unresolvedPermissions(globalPermissions);
        }

        const committed = state.indexes.nodes[item.props.id]?.data;
        if (committed && committed.type !== item.type) {
          return unresolvedPermissions(globalPermissions);
        }
        const candidate = committed && candidateCache.get(committed);
        if (candidate && deepEqual(candidate.item, item) && candidate.isCurrent()) {
          return candidate.permissions;
        }

        const initialPermissions = {
          ...globalPermissions,
          ...componentConfig?.permissions,
        };

        const entry = permissions.cache[item.props.id];
        const inputs = entry && cacheInputs.get(entry);
        const parentId = state.indexes.nodes[item.props.id]?.parentId;
        const parent = parentId ? state.indexes.nodes[parentId]?.data ?? null : null;
        const resolvedForItem =
          componentConfig?.resolvePermissions &&
          (!committed || !unresolvedLifetime.has(committed)) &&
          entry &&
          !invalidEntries.has(entry) &&
          entry?.lastData?.type === item.type &&
          deepEqual(entry.lastData, item) &&
          entry.lastParentId === parentId &&
          inputs?.config === config &&
          inputs.globalPermissions === globalPermissions &&
          inputs.generation === policyGeneration &&
          sameAppState(inputs.appState, makeStatePublic(state)) &&
          deepEqual(inputs.parent, parent) &&
          inputs.resolver === componentConfig.resolvePermissions
            ? resolvedPermissions[item.props.id]
            : undefined;

        return (
          resolvedForItem
            ? { ...initialPermissions, ...resolvedForItem }
            : componentConfig?.resolvePermissions
              ? unresolvedPermissions(initialPermissions as Permissions)
              : initialPermissions
        ) as Permissions;
      } else if (type) {
        const componentConfig = config.components[type];
        if (!Object.prototype.hasOwnProperty.call(config.components, type) || !componentConfig) {
          return unresolvedPermissions(globalPermissions);
        }

        return {
          ...globalPermissions,
          ...componentConfig?.permissions,
        } as Permissions;
      } else if (root || item?.type === "root") {
        const rootConfig = config.root;

        const committed = state.indexes.nodes.root?.data;
        const candidate = committed && candidateCache.get(committed);
        if (item?.type === "root" && candidate &&
            deepEqual(candidate.item, item) && candidate.isCurrent()) {
          return candidate.permissions;
        }

        const initialPermissions = {
          ...globalPermissions,
          ...rootConfig?.permissions,
        } as Permissions;

        const entry = permissions.cache["root"];
        const inputs = entry && cacheInputs.get(entry);
        // A root candidate can be resolved before it is committed. Callers
        // must be able to inspect that exact decision while the committed root
        // still has different props.
        const rootItem = item?.type === "root"
          ? item
          : rootPermissionItem(state.data.root);
        const resolvedForItem =
          rootConfig?.resolvePermissions &&
          entry &&
          !invalidEntries.has(entry) &&
          entry?.lastData?.type === "root" &&
          deepEqual(entry.lastData, rootItem) &&
          inputs?.config === config &&
          inputs.globalPermissions === globalPermissions &&
          inputs.generation === policyGeneration &&
          sameAppState(inputs.appState, makeStatePublic(state)) &&
          inputs.resolver === rootConfig.resolvePermissions
            ? resolvedPermissions["root"]
            : undefined;

        return (
          resolvedForItem
            ? { ...initialPermissions, ...resolvedForItem }
            : rootConfig?.resolvePermissions
              ? unresolvedPermissions(initialPermissions)
              : initialPermissions
        ) as Permissions;
      }

      return globalPermissions;
    },
    resolvePermissions,
    refreshPermissions,
  };
};

export const useRegisterPermissionsSlice = (
  appStore: ReturnType<typeof useAppStoreApi>,
  globalPermissions: Partial<Permissions>,
) => {
  const refresh = () => {
    void appStore.getState().permissions.resolvePermissions().catch((error) => {
      if (error instanceof PermissionResolutionSupersededError) return;
      // Resolver errors may contain host data. Do not expose their contents.
      console.error("Puck could not resolve editor permissions.");
    });
  };

  useEffect(() => {
    const { permissions } = appStore.getState();
    const { globalPermissions: existingGlobalPermissions } = permissions;
    const nextGlobalPermissions = {
      ...existingGlobalPermissions,
      ...globalPermissions,
    } as Permissions;
    if (!deepEqual(existingGlobalPermissions, nextGlobalPermissions)) {
      appStore.setState({
        permissions: { ...permissions, globalPermissions: nextGlobalPermissions },
      });
    }

    refresh();
  }, [globalPermissions]);

  useEffect(() => {
    return appStore.subscribe(
      (s) => s.state.data,
      () => {
        refresh();
      },
    );
  }, []);

  useEffect(() => {
    return appStore.subscribe(
      (s) => s.state.ui,
      () => {
        refresh();
      },
    );
  }, []);

  useEffect(() => {
    return appStore.subscribe(
      (s) => s.config,
      () => {
        refresh();
      },
    );
  }, []);
};
