"use client";

import { ConfigPreview } from "@/docs/components/Preview";

export function Example1() {
  return (
<ConfigPreview
  label="Example"
  componentConfig={{
    fields: {
      params: {
        type: "object",
        objectFields: {
          title: { type: "text" },
        },
      },
    },
    defaultProps: { params: { title: "Hello, world" } },
    render: ({ params }) => {
      return <p>{params.title}</p>;
    },
  }}
/>
  );
}

