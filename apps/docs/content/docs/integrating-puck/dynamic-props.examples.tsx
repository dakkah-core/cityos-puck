"use client";

import { ConfigPreview } from "@/docs/components/Preview";

export function Example1() {
  return (
<ConfigPreview
  label='Try changing the "title" field'
  componentConfig={{
    fields: {
      title: {
        type: "text",
      },
      resolvedTitle: {
        type: "text",
      },
    },
    defaultProps: {
      title: "Hello, world",
    },
    resolveData: ({ props }) => {
      return {
        props: { resolvedTitle: props.title },
      };
    },
    render: ({ resolvedTitle }) => {
      return <p style={{ margin: 0 }}>{resolvedTitle}</p>;
    },

}}
/>
  );
}

export function Example2() {
  return (
<ConfigPreview
  label='The resolvedTitle field is locked'
  componentConfig={{
    fields: {
      title: {
        type: "text",
      },
      resolvedTitle: {
        type: "text",
      },
    },
    defaultProps: {
      title: "Hello, world",
    },
    resolveData: ({ props }) => {
      return {
        props: { resolvedTitle: props.title },
        readOnly: { resolvedTitle: true }
      };
    },
    render: ({ resolvedTitle }) => {
      return <p style={{ margin: 0 }}>{resolvedTitle}</p>;
    },

}}
/>
  );
}

