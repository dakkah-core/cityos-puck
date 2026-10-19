"use client";

import { ConfigPreview } from "@/docs/components/Preview";

export function Example1() {
  return (
<ConfigPreview
  label="Example"
  componentConfig={{
    fields: {
      decorations: {
        type: "checkbox",
        options: [
          { label: "Underline", value: "underline" },
          { label: "Overline", value: "overline" },
          { label: "Strikethrough", value: "line-through" },
        ],
      },
    },
    defaultProps: {
      decorations: ["underline"],
    },
    render: ({ decorations }) => {
      return (
        <p
          style={{
            textDecorationLine: decorations.join(" ") || "none",
            margin: 0,
          }}
        >
          Hello, world
        </p>
      );
    },
  }}
/>
  );
}

