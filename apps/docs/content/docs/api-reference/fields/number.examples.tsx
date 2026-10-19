"use client";

import { ConfigPreview } from "@/docs/components/Preview";

export function Example1() {
  return (
<ConfigPreview
  label="Example"
  componentConfig={{
    fields: {
      myNumber: {
        type: "number",
      },
    },
    defaultProps: { myNumber: 5 },
    render: ({ myNumber }) => {
      return <div>{myNumber}</div>;
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
      myNumber: {
        type: "number",
        max: 10,
      },
    },
    defaultProps: { myNumber: 5 },
    render: ({ myNumber }) => {
      return <div>{myNumber}</div>;
    },
  }}
/>
  );
}

export function Example3() {
  return (
<ConfigPreview
  label="Example"
  componentConfig={{
    fields: {
      myNumber: {
        type: "number",
        min: 0,
      },
    },
    defaultProps: { myNumber: 5 },
    render: ({ myNumber }) => {
      return <div>{myNumber}</div>;
    },
  }}
/>
  );
}

export function Example4() {
  return (
<ConfigPreview
  label="Example"
  componentConfig={{
    fields: {
      myNumber: {
        type: "number",
        placeholder: "Lorem ipsum...",
      },
    },
    render: ({ myNumber }) => {
      return <div>{myNumber}</div>;
    },
  }}
/>
  );
}

export function Example5() {
  return (
<ConfigPreview
  label="Example"
  componentConfig={{
    fields: {
      myNumber: {
        type: "number",
        step: 0.1,
      },
    },
    defaultProps: { myNumber: 5 },
    render: ({ myNumber }) => {
      return <div>{myNumber}</div>;
    },
  }}
/>
  );
}

