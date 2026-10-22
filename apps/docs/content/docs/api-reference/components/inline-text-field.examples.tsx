"use client";

import { PuckPreview } from "@/docs/components/Preview";
import { Puck, InlineTextField } from "@/puck";

export function Example1() {
  return (
<PuckPreview
  label="Example"
  config={{
    components: {
      Example: {
        fields: {
          heading: { type: "heading" },
        },
        render: ({ heading }) => <h2>{heading}</h2>,
      },
    },
  }}
  data={{
    content: [
      {
        type: "Example",
        props: {
          id: "example",
          heading: "Edit me inline",
        },
      },
    ],
    root: { props: {} },
  }}
  overrides={{
    fieldTypes: {
      heading: () => <div />,
    },
  }}
  fieldTransforms={{
    heading: ({ value, componentId, propPath, isReadOnly, field }) => (
      <InlineTextField
        value={value}
        componentId={componentId}
        propPath={propPath}
        isReadOnly={isReadOnly}
      />
    ),
  }}
  permissions={{ drag: false, delete: false, duplicate: false }}
/>
  );
}

