"use client";

import { ConfigPreview } from "@/docs/components/Preview";

export function Example1() {
  return (
<ConfigPreview
  label="Example"
  componentConfig={{
    fields: {
      textAlign: {
        type: "radio",
        options: [
          { label: "Left", value: "left" },
          { label: "Right", value: "right" },
        ],
      },
    },
    defaultProps: {
      textAlign: "left",
    },
    render: ({ textAlign }) => {
      return <p style={{ textAlign, margin: 0 }}>Hello, world</p>;
    },
  }}
/>
  );
}

