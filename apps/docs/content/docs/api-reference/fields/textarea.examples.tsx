"use client";

import { Puck } from "@/puck";
import { ConfigPreview, PuckPreview } from "@/docs/components/Preview";

export function Example1() {
  return (
<ConfigPreview
  label="Example"
  componentConfig={{
    fields: {
      description: {
        type: "textarea",
      },
    },
    render: ({ description }) => {
      return <p>{description}</p>;
    },
    defaultProps: { description: "Hello, world" },
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
      description: {
        type: "textarea",
        contentEditable: true,
      },
    },
    defaultProps: {
      description:
        "You can edit this in the preview section, too.\nIt also supports line breaks.",
    },
    render: ({ description }) => {
      return <div>{description}</div>;
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
      description: {
        type: "textarea",
        placeholder: "Lorem ipsum...",
      },
    },
    render: ({ description }) => {
      return <div>{description}</div>;
    },
  }}
/>
  );
}

