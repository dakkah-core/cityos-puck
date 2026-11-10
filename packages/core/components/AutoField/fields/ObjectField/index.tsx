import { MoreVertical } from "lucide-react";
import { FieldPropsInternal } from "../..";
import { useNestedFieldContext } from "../../context";
import { useAppStore, useAppStoreApi } from "../../../../store";
import { getDeep } from "../../../../lib/data/get-deep";
import { setDeep } from "../../../../lib/data/set-deep";
import {
  getPendingFieldValue,
  withObjectFieldChange,
} from "../../../Puck/components/Fields/on-change";
import { SubField } from "../../subfield";
import { useFieldStoreApi } from "../../store";
import {
  FieldGroupInternal,
  FieldGroupItemInternal,
} from "../../../FieldGroup";
import { isFieldVisible } from "../../../../lib/fields/is-field-visible";
import { rendersCollapsibleGroup } from "../../../../lib/fields/renders-collapsible-group";

export const ObjectField = ({
  field,
  onChange,
  id,
  name: fieldName,
  label,
  labelIcon,
  Label,
  readOnly,
  expanded,
  onToggle,
}: FieldPropsInternal) => {
  const name = fieldName ?? id;

  const { localName = name } = useNestedFieldContext();

  const fieldStore = useFieldStoreApi();
  const appStore = useAppStoreApi();

  const canEdit = useAppStore(
    (s) =>
      s.permissions.getPermissions({
        item: s.selectedItem,
        root: !s.selectedItem,
      }).edit,
  );

  const fieldTypeOverrides = useAppStore((s) => s.overrides.fieldTypes);

  const getValue = () => getDeep(fieldStore.getState(), name) ?? {};

  if (field.type !== "object" || !field.objectFields) {
    return null;
  }

  // Don't show hidden subfields
  const subNames = Object.keys(field.objectFields).filter((subName) =>
    isFieldVisible(fieldTypeOverrides, field.objectFields![subName]),
  );

  const labelProps = {
    label: label || fieldName,
    icon: labelIcon || <MoreVertical size={16} />,
    readOnly,
  };

  // The group renders nothing without content, but the label should stay
  if (subNames.length === 0) {
    return <Label {...labelProps} el="div" />;
  }

  return (
    <FieldGroupInternal
      {...labelProps}
      Label={Label}
      variant={field.variant ?? "card"}
      collapsible={field.collapsible}
      expanded={expanded}
      onToggle={onToggle}
    >
      {subNames.map((subName) => {
        const subField = field.objectFields![subName];
        const subPath = `${localName}.${subName}`;

        return (
          <FieldGroupItemInternal
            key={subPath}
            collapsible={rendersCollapsibleGroup(subField, fieldTypeOverrides)}
          >
            <SubField
              id={`${id}_${subName}`}
              name={name}
              subName={subName}
              localName={localName}
              field={subField}
              forceReadOnly={!!readOnly || !canEdit}
              onChange={(subValue, ui, subName) => {
                const topLevelName = name.split(/[.[]/, 1)[0];
                const pending = getPendingFieldValue(appStore, topLevelName);
                // A prior commit can have synchronized an older object into the
                // field store while a later edit is still queued. Restore only
                // this field before parent object/array handlers read it.
                if (pending) {
                  fieldStore.setState({ [topLevelName]: pending.value });
                }
                const value = getValue();

                // Skip onChange if value hasn't changed
                if (value[subName] === subValue) {
                  return;
                }

                const nextValue = { ...value, [subName]: subValue };
                withObjectFieldChange(
                  appStore,
                  `${name}.${subName}`,
                  subValue,
                  () => onChange(nextValue, ui),
                );
                fieldStore.setState(setDeep(fieldStore.getState(), name, nextValue));
              }}
            />
          </FieldGroupItemInternal>
        );
      })}
    </FieldGroupInternal>
  );
};
