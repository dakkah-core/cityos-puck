"use client";

import { PuckPreview } from "@/docs/components/Preview";
import { FieldGroup, AutoField, FieldLabel } from "@/puck";

export function Example1() {
  return (
    <PuckPreview
      config={{ components: { Orange: { render: () => <div>Orange</div> } } }}
      data={{ root: { props: {} }, content: [] }}
    >
      <FieldGroup label="Appearance">
        <FieldGroup.Item>
          <FieldLabel label="Color">
            <AutoField
              value="#000000"
              onChange={() => {}}
              field={{ type: "text" }}
            />
          </FieldLabel>
        </FieldGroup.Item>
        <FieldGroup.Item>
          <FieldLabel label="Size">
            <AutoField
              value="12"
              onChange={() => {}}
              field={{ type: "number" }}
            />
          </FieldLabel>
        </FieldGroup.Item>
      </FieldGroup>
    </PuckPreview>
  );
}

export function Example2() {
  return (
    <PuckPreview
      config={{ components: {} }}
      data={{ root: { props: {} }, content: [] }}
    >
      <FieldGroup label="Appearance" collapsible={false}>
        <FieldGroup.Item>
          <FieldLabel label="Color">
            <AutoField
              value="#000000"
              onChange={() => {}}
              field={{ type: "text" }}
            />
          </FieldLabel>
        </FieldGroup.Item>
      </FieldGroup>
    </PuckPreview>
  );
}

export function Example3() {
  return (
    <PuckPreview
      config={{ components: {} }}
      data={{ root: { props: {} }, content: [] }}
    >
      <FieldGroup label="Appearance" defaultExpanded>
        <FieldGroup.Item>
          <FieldLabel label="Color">
            <AutoField
              value="#000000"
              onChange={() => {}}
              field={{ type: "text" }}
            />
          </FieldLabel>
        </FieldGroup.Item>
      </FieldGroup>
    </PuckPreview>
  );
}
