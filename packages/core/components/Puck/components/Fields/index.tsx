import { Loader } from "../../../Loader";
import { isFieldVisible } from "../../../../lib/fields/is-field-visible";
import { rendersCollapsibleGroup } from "../../../../lib/fields/renders-collapsible-group";
import { ItemSelector } from "../../../../lib/data/get-item";
import { ComponentConfig } from "../../../../types";
import { AutoFieldPrivate } from "../../../AutoField";
import { FieldGroupItemInternal } from "../../../FieldGroup";
import { Tabs, TabsChangeReason, TabValue } from "../../../Tabs";
import { fieldContextStore } from "../../../AutoField/store";
import { AppStore, useAppStore, useAppStoreApi } from "../../../../store";
import styles from "./styles.module.css";
import { getClassNameFactory } from "../../../../lib";
import { useMessage } from "../../../../lib/use-message";
import {
  memo,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { useRegisterFieldsSlice } from "../../../../store/slices/fields";
import { useShallow } from "zustand/react/shallow";
import { createOnChange, getPendingFieldValue } from "./on-change";
import {
  dismissFieldEdit,
  getFieldEditAlerts,
  reportFieldEdit,
  subscribeFieldEditAlerts,
} from "./edit-alerts";
import type { FieldEditAlert } from "./edit-alerts";

const getClassName = getClassNameFactory("PuckFields", styles);

/**
 * Checks if the fields slice matches the currently selected item's ID.
 *
 * The fields slice can be behind by one render cycle after the selection changes,
 * which would match the selected item's data with the previous item's fields
 *
 * @param s The application store state.
 * @returns `true` if the fields slice is up to date with the selected item's ID, `false` otherwise.
 */
const isFieldsReady = (s: AppStore) =>
  s.fields.id === (s.selectedItem?.props.id || "root");

const FieldsChildInner = ({ fieldName }: { fieldName: string }) => {
  const fieldTypeOverrides = useAppStore((s) => s.overrides.fieldTypes);

  const field = useAppStore((s) => s.fields.fields[fieldName]);

  const isReadOnly = useAppStore(
    (s) =>
      ((s.selectedItem
        ? s.selectedItem.readOnly
        : s.state.data.root.readOnly) || {})[fieldName],
  );

  const id = useAppStore((s) => {
    if (!field) return null;

    return s.selectedItem
      ? `${s.selectedItem.props.id}_${field.type}_${fieldName}`
      : `root_${field.type}_${fieldName}`;
  });

  const permissions = useAppStore(
    useShallow((s) => {
      const { selectedItem, permissions } = s;

      return selectedItem
        ? permissions.getPermissions({ item: selectedItem })
        : permissions.getPermissions({ root: true });
    }),
  );

  const appStore = useAppStoreApi();
  const fieldStore = useContext(fieldContextStore.ctx);

  const onChange = useMemo(() => {
    return (value: any, ui?: Parameters<ReturnType<typeof createOnChange>>[1]) => {
      const { selectedItem: selected, state } = appStore.getState();
      const target: FieldEditAlert["target"] =
        selected && state.ui.itemSelector
          ? { kind: "item", id: selected.props.id, type: selected.type }
          : { kind: "root" };
      const restoreField = () => {
        // Nested handlers write optimistic values after invoking onChange.
        // Reconcile after those writes, without clobbering a newer draft or a
        // different selection that now owns this field store.
        queueMicrotask(() => {
          const current = appStore.getState();
          const selected = current.selectedItem;
          const sameTarget =
            target.kind === "root"
              ? !selected && !current.state.ui.itemSelector
              : !!current.state.ui.itemSelector &&
                selected?.props.id === target.id &&
                selected.type === target.type;
          if (!sameTarget || getPendingFieldValue(appStore, fieldName)) return;
          const data = current.getCurrentData();
          const props = (data.props ?? data) as Record<string, unknown>;
          fieldStore.setState({ [fieldName]: props[fieldName] });
        });
      };
      let canceled = false;
      const change = createOnChange(fieldName, appStore, () => {
        canceled = true;
        restoreField();
        reportFieldEdit(appStore, {
          field: fieldName,
          target,
          reason: "canceled",
        });
      });
      void change(value, ui).catch(() => {
        if (!canceled) {
          restoreField();
          reportFieldEdit(appStore, {
            field: fieldName,
            target,
            reason: "failed",
          });
        }
      });
    };
  }, [fieldName, appStore, fieldStore]);

  useEffect(() => {
    return appStore.subscribe(
      (s) => {
        const data = s.getCurrentData();

        return data.props?.[fieldName];
      },
      (value) => {
        fieldStore.setState({ [fieldName]: value });
      },
    );
  }, [appStore, fieldStore]);

  if (!id || !isFieldVisible(fieldTypeOverrides, field)) return null;

  return (
    <FieldGroupItemInternal
      key={id}
      className={getClassName("field")}
      collapsible={rendersCollapsibleGroup(field, fieldTypeOverrides)}
    >
      <AutoFieldPrivate
        field={field}
        name={fieldName}
        id={id}
        readOnly={!permissions.edit || isReadOnly}
        onChange={onChange}
      />
    </FieldGroupItemInternal>
  );
};

const FieldsChild = ({ fieldName }: { fieldName: string }) => {
  const appStore = useAppStoreApi();

  const initialValue = useMemo(() => {
    const value = appStore.getState().getCurrentData().props?.[fieldName];

    return { [fieldName]: value };
  }, []);

  return (
    <fieldContextStore.Provider value={initialValue}>
      <FieldsChildInner fieldName={fieldName} />
    </fieldContextStore.Provider>
  );
};

const FieldsChildMemo = memo(FieldsChild);

const FieldEditAlertMessage = ({ alert }: { alert: FieldEditAlert }) => {
  const appStore = useAppStoreApi();
  const pageLabel = useMessage("label-page");
  const target =
    alert.target.kind === "root"
      ? pageLabel
      : `${alert.target.type} (${alert.target.id})`;
  const message = useMessage(
    alert.reason === "canceled" ? "field-edit-canceled" : "field-edit-failed",
    { field: alert.field, target },
  );
  const dismiss = useMessage("field-edit-dismiss");
  return (
    <div role="alert">
      {message}{" "}
      <button type="button" onClick={() => dismissFieldEdit(appStore, alert.id)}>
        {dismiss}
      </button>
    </div>
  );
};

const FieldEditAlerts = () => {
  const appStore = useAppStoreApi();
  const subscribe = useCallback(
    (listener: () => void) => subscribeFieldEditAlerts(appStore, listener),
    [appStore],
  );
  const getSnapshot = useCallback(() => getFieldEditAlerts(appStore), [appStore]);
  const alerts = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return (
    <>
      {alerts.map((alert) => (
        <FieldEditAlertMessage key={alert.id} alert={alert} />
      ))}
    </>
  );
};

/** Renders the default fields wrapper */
const DefaultFields = ({
  children,
}: {
  children: ReactNode;
  isLoading: boolean;
  itemSelector?: ItemSelector | null;
  fields: Partial<Record<string, ReactNode>>;
}) => {
  return <>{children}</>;
};

/**
 * Renders the default fields layout:
 * All fields as direct children of wherever the component is rendered.
 */
const DefaultFieldsLayout: NonNullable<ComponentConfig["renderFields"]> = ({
  fields,
}) => <>{Object.values(fields)}</>;

/**
 * Renders the provided fields for the currently selected component.
 * Uses the component's `renderFields` if defined.
 *
 * To use within the `fields` override.
 */
export const ComponentFields = ({
  fields,
}: {
  /** The fields of the currently selected item to render */
  fields: Partial<Record<string, ReactNode>>;
}) => {
  const fieldsReady = useAppStore(isFieldsReady);
  const renderFields = useAppStore(
    (s) => s.getComponentConfig(s.selectedItem?.type)?.renderFields,
  );
  const RenderFields = renderFields ?? DefaultFieldsLayout;

  return (
    <div className={getClassName("rows")}>
      {fieldsReady && <RenderFields fields={fields} />}
    </div>
  );
};

/**
 * Renders the fields' tabs.
 *
 * NB: Needs to be in its own component, to avoid re-rendering the entire fields section when the selected tab changes.
 */
const FieldTabs = ({ children }: { children: ReactNode }) => {
  const appStore = useAppStoreApi();
  const fieldTab = useAppStore((s) => s.state.ui.fieldTab);

  const onChange = useCallback(
    (value: TabValue, { reason }: { reason: TabsChangeReason }) => {
      const state = appStore.getState();

      // Tabs come and go while the next item's fields sync in the field slice,
      // so only replace a missing tab once they're ready
      if (reason === "missing" && !isFieldsReady(state)) return;

      if (state.state.ui.fieldTab === value) return;

      state.dispatch({ type: "setUi", ui: { fieldTab: value } });
    },
    [appStore],
  );

  return (
    <Tabs value={fieldTab} onChange={onChange}>
      {children}
    </Tabs>
  );
};

const FieldsInternal = ({ wrapFields = true }: { wrapFields?: boolean }) => {
  const overrides = useAppStore((s) => s.overrides);
  const componentResolving = useAppStore((s) => {
    const loadingCount = s.selectedItem
      ? s.componentState[s.selectedItem.props.id]?.loadingCount
      : s.componentState["root"]?.loadingCount;

    return (loadingCount ?? 0) > 0;
  });
  const itemSelector = useAppStore(useShallow((s) => s.state.ui.itemSelector));
  const id = useAppStore((s) => s.selectedItem?.props.id);
  const appStore = useAppStoreApi();
  useRegisterFieldsSlice(appStore, id);

  const fieldsReady = useAppStore(isFieldsReady);
  const fieldsLoading = useAppStore((s) => s.fields.loading);

  // Subscribe to the visible fields
  const visibleFieldNames = useAppStore(
    useShallow((s) => {
      const { fields } = s.fields;

      return Object.keys(fields).filter((fieldName) =>
        isFieldVisible(s.overrides.fieldTypes, fields[fieldName]),
      );
    }),
  );

  // Render each visible field, so layouts and overrides can place them individually
  const fields = useMemo(() => {
    const fieldMap: Record<string | number, ReactNode> = {};

    if (!fieldsReady) return fieldMap;

    visibleFieldNames.forEach((fieldName) => {
      fieldMap[fieldName] = (
        <FieldsChildMemo key={fieldName} fieldName={fieldName} />
      );
    });

    return fieldMap;
  }, [fieldsReady, visibleFieldNames]);

  const isLoading = fieldsLoading || componentResolving;

  const Wrapper = useMemo(() => overrides.fields || DefaultFields, [overrides]);

  return (
    <>
      <FieldEditAlerts />
      <form
        className={getClassName({ wrapFields })}
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <FieldTabs>
          <Wrapper
            isLoading={isLoading}
            itemSelector={itemSelector}
            fields={fields}
          >
            <ComponentFields fields={fields} />
          </Wrapper>
        </FieldTabs>
        {isLoading && (
          <div className={getClassName("loadingOverlay")}>
            <div className={getClassName("loadingOverlayInner")}>
              <Loader size={16} />
            </div>
          </div>
        )}
      </form>
    </>
  );
};

export const Fields = memo(FieldsInternal);
