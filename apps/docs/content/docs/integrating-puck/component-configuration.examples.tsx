"use client";

import { ConfigPreview, PuckPreview } from "@/docs/components/Preview";
import { Puck } from "@/puck";

export function Example1() {
  return (
<PuckPreview
  label="Try interacting with the heading"
  config={{
    components: {
      HeadingBlock: {
        render: () => {
          return <span>Hello, world</span>;
        },
      },
    },
  }}
  data={{
    content: [{ type: "HeadingBlock", props: { id: "HeadingBlock-1" } }],
    root: { props: {} },
  }}
>
  <Puck.Preview />
</PuckPreview>
  );
}

export function Example2() {
  return (
<ConfigPreview
  label='Text field example'
  componentConfig={{
    fields: {
      title: {
        type: "text",
      },
    },
    render: ({ title }) => {
      return <span>{title}</span>;
    },

}}
/>
  );
}

export function Example3() {
  return (
<ConfigPreview
  label="Text field example"
  componentConfig={{
    fields: {
      title: {
        type: "text",
      },
    },
    defaultProps: {
      title: "Hello, world",
    },
    render: ({ title }) => {
      return <span>{title}</span>;
    },
  }}
/>
  );
}

