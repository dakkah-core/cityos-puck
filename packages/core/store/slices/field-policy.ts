import { deepEqual } from "fast-equals";
import type { AppStore } from "..";
import type { ComponentConfig, ComponentData } from "../../types";
import { flattenData } from "../../lib/data/flatten-data";
import { getItem } from "../../lib/data/get-item";
import { walkAppState } from "../../lib/data/walk-app-state";
import { getChanged } from "../../lib/get-changed";

export class FieldPolicyRefreshSupersededError extends Error {
  readonly code = "PUCK_FIELD_POLICY_SUPERSEDED";

  constructor() {
    super("Field policy refresh was superseded.");
    this.name = "FieldPolicyRefreshSupersededError";
  }
}

// Policy is derived from resolveData, but its returned props are content, not
// policy. Never write them during a policy refresh or record an undo entry.
export const createFieldPolicyRefresh = (
  set: (state: Partial<AppStore>) => void,
  get: () => AppStore,
) => {
  let generation = 0;
  return async (): Promise<void> => {
    const version = ++generation;
    const signal = (pending: boolean) => {
      const fields = get().fields;
      set({ fields: { ...fields, policyPending: pending, policyRevision: fields.policyRevision + 1 } });
    };
    signal(true);
    let pending = true;
    try {
      for (;;) {
        if (version !== generation) throw new FieldPolicyRefreshSupersededError();
        const { state, config, metadata } = get();
        const items = flattenData(state, config);
        const decisions = await Promise.all(items.map(async (item) => {
          const component = item.type === "root" ? config.root : config.components[item.type];
          const resolve = component?.resolveData as ComponentConfig["resolveData"];
          if (!resolve) return null;
          const parentId = state.indexes.nodes[item.props.id]?.parentId;
          const parent = parentId ? state.indexes.nodes[parentId]?.data ?? null : null;
          const result = await resolve(item, {
            changed: getChanged(item, null),
            lastData: null,
            metadata: { ...metadata, ...component?.metadata },
            trigger: "force",
            parent,
            root: state.data.root,
          });
          return [item.props.id, result.readOnly] as const;
        }));
        if (version !== generation) throw new FieldPolicyRefreshSupersededError();
        const latest = get();
        // Re-evaluate if content, history, config, or metadata changed while a
        // host resolver was pending. No old props or positions are committed.
        if (latest.state.data !== state.data || latest.config !== config || latest.metadata !== metadata) continue;
        const byId = new Map(decisions.filter((entry): entry is NonNullable<typeof entry> => entry !== null));
        if (items.some((item) => byId.has(item.props.id) && !deepEqual(item.readOnly, byId.get(item.props.id)))) {
          const nextState = walkAppState(latest.state, config, (content) => content, (item: ComponentData) =>
            byId.has(item.props.id) ? { ...item, readOnly: byId.get(item.props.id) } : item,
          );
          const selectedItem = nextState.ui.itemSelector ? getItem(nextState.ui.itemSelector, nextState) : null;
          set({ state: nextState, selectedItem });
        }
        signal(false);
        pending = false;
        if (version !== generation) throw new FieldPolicyRefreshSupersededError();
        await get().fields.refreshPolicyFields?.();
        if (version !== generation) throw new FieldPolicyRefreshSupersededError();
        return;
      }
    } finally {
      if (pending && version === generation) signal(false);
    }
  };
};
