"use client";

import { ConfigPreview } from "@/docs/components/Preview";

export function Example1() {
  return (
<div
  style={{
    "--puck-field-radius": "32px",
    "--puck-field-color-border": "transparent",
    "--puck-field-color-bg": "#f0f0f0",
  }}
>
  <ConfigPreview
    label="Example"
    componentConfig={{
      fields: { title: { type: "text", label: "Title" } },
      defaultProps: { title: "Hello, world" },
      render: ({ title }) => <p style={{ margin: 0 }}>{title}</p>,
    }}
  />
</div>
  );
}
