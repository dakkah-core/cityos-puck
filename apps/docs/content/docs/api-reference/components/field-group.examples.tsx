"use client";

import { PuckPreview } from "@/docs/components/Preview";
import { FieldGroup, AutoField, FieldLabel, FieldGroupItem } from "@/puck";

export function Example1() {
  return (
    <PuckPreview
      config={{ components: { Orange: { render: () => <div>Orange</div> } } }}
      data={{ root: { props: {} }, content: [] }}
    >
      <FieldGroup label="Appearance">
        <FieldGroupItem>
          <FieldLabel label="Color">
            <AutoField
              value="#000000"
              onChange={() => {}}
              field={{ type: "text" }}
            />
          </FieldLabel>
        </FieldGroupItem>
        <FieldGroupItem>
          <FieldLabel label="Size">
            <AutoField
              value="12"
              onChange={() => {}}
              field={{ type: "number" }}
            />
          </FieldLabel>
        </FieldGroupItem>
      </FieldGroup>
    </PuckPreview>
  );
}

export function Example2() {
  return (
    <PuckPreview
      config={{ components: { Orange: { render: () => <div>Orange</div> } } }}
      data={{ root: { props: {} }, content: [] }}
    >
      <FieldGroup label="Appearance" expandable>
        <FieldGroupItem>
          <FieldLabel label="Color">
            <AutoField
              value="#000000"
              onChange={() => {}}
              field={{ type: "text" }}
            />
          </FieldLabel>
        </FieldGroupItem>
        <FieldGroupItem>
          <FieldLabel label="Size">
            <AutoField
              value="12"
              onChange={() => {}}
              field={{ type: "number" }}
            />
          </FieldLabel>
        </FieldGroupItem>
      </FieldGroup>
    </PuckPreview>
  );
}
