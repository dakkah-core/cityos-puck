"use client";

import { ConfigPreview } from "@/docs/components/Preview";

export function Example1() {
  return (
<ConfigPreview
  label="Example"
  componentConfig={{
    fields: {
      data: {
        type: "external",
        getItemSummary: (item) => item.title,
        fetchList: async () => {
          return [
            { title: "Hello, world", description: "Lorem ipsum 1" },
            { title: "Goodbye, world", description: "Lorem ipsum 2" },
          ];
        },
      },
    },
    render: ({ data }) => {
      if (!data) {
        return "No data selected";
      }

      return (
        <>
          <b>{data.title}</b>
          <p>{data.description}</p>
        </>
      );
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
      data: {
        type: "external",
        getItemSummary: (item) => item.title,
        fetchList: async () => {
          return [
            { title: "Hello, world", description: "Lorem ipsum 1" },
            { title: "Goodbye, world", description: "Lorem ipsum 2" },
          ];
        },
      },
      title: {
        type: "text",
      },
    },
    resolveData: async ({ props }) => {
      if (!props.data) return { props,  readOnly: { title: false } };

      return {
        props: { title: props.data.title },
        readOnly: { title: true }
      };
    },
    render: ({ title }) => {
      return (
        <>
          <b>{title}</b>
        </>
      );
    },

}}
/>
  );
}

