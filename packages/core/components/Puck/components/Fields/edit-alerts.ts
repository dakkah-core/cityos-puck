import type { StoreApi } from "zustand";
import type { AppStore } from "../../../../store";

export type FieldEditAlert = {
  id: number;
  field: string;
  target: { kind: "root" } | { kind: "item"; id: string; type: string };
  reason: "canceled" | "failed";
};

type AlertState = {
  alerts: readonly FieldEditAlert[];
  nextId: number;
  listeners: Set<() => void>;
};

// The editor store outlives individual fields and Fields panel instances. Keep
// reports until dismissed, including reports produced while the panel is closed.
const states = new WeakMap<StoreApi<AppStore>, AlertState>();
const getState = (store: StoreApi<AppStore>): AlertState => {
  let state = states.get(store);
  if (!state) {
    state = { alerts: [], nextId: 0, listeners: new Set() };
    states.set(store, state);
  }
  return state;
};

export const reportFieldEdit = (
  store: StoreApi<AppStore>,
  alert: Omit<FieldEditAlert, "id">,
) => {
  const state = getState(store);
  state.alerts = [...state.alerts, { ...alert, id: state.nextId++ }];
  state.listeners.forEach((listener) => listener());
};

export const dismissFieldEdit = (store: StoreApi<AppStore>, id: number) => {
  const state = getState(store);
  state.alerts = state.alerts.filter((alert) => alert.id !== id);
  state.listeners.forEach((listener) => listener());
};

export const getFieldEditAlerts = (store: StoreApi<AppStore>) =>
  getState(store).alerts;

export const subscribeFieldEditAlerts = (
  store: StoreApi<AppStore>,
  listener: () => void,
) => {
  const listeners = getState(store).listeners;
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
