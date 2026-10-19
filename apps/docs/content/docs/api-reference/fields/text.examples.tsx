"use client";

import { Puck } from "@/puck";
import { ConfigPreview, PuckPreview } from "@/docs/components/Preview";

export function Example1() {
  return (
<ConfigPreview
  label="Example"
  componentConfig={{
    fields: {
      title: {
        type: "text",
      },
    },
    defaultProps: { title: "Hello, world" },
    render: ({ title }) => {
      return <p style={{ margin: 0 }}>{title}</p>;
    },
  }}
/>
  );
}

export function Example2() {
  return (
<ConfigPreview
  label="Example"
  componentConfig={{
    fields: {
      title: {
        type: "text",
        contentEditable: true,
      },
    },
    defaultProps: {
      title: "Edit me inline",
    },
    render: ({ title }) => {
      return <div>{title}</div>;
    },
  }}
>
  <Puck.Preview />
</ConfigPreview>
  );
}

export function Example3() {
  return (
<ConfigPreview
  label="Example"
  componentConfig={{
    fields: {
      title: {
        type: "text",
        placeholder: "Lorem ipsum...",
      },
    },
    render: ({ title }) => {
      return <div>{title}</div>;
    },
  }}
/>
  );
}

