import { Data } from "../../types";
import { SetAction } from "../actions";
import { AppStore } from "../../store";
import { PrivateAppState } from "../../types/Internal";
import { walkAppState } from "../../lib/data/walk-app-state";

const rebuildSetState = <UserData extends Data>(
  state: PrivateAppState<UserData>,
  appStore: AppStore,
): PrivateAppState<UserData> => {
  const rebuilt = walkAppState({
    ...state,
    indexes: { nodes: {}, zones: {} },
  }, appStore.config);

  return { ...rebuilt, data: { ...state.data, ...rebuilt.data } };
};

export const setAction = <UserData extends Data>(
  state: PrivateAppState<UserData>,
  action: SetAction<UserData>,
  appStore: AppStore,
): PrivateAppState<UserData> => {
  if (typeof action.state === "object") {
    const newState = {
      ...state,
      ...action.state,
    };

    if (!action.state.data) {
      return newState;
    }

    if (!action.state.indexes) {
      console.warn(
        "`set` is expensive and may cause unnecessary re-renders. Consider using a more atomic action instead.",
      );
    }

    // A supplied index can describe older data. Rebuild it from the data.
    return rebuildSetState(newState, appStore);
  }

  const update = action.state(state);
  const newState = { ...state, ...update };
  if (update.data) {
    return rebuildSetState(newState, appStore);
  }
  return newState;
};
