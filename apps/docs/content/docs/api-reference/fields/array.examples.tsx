"use client";

import { ConfigPreview } from "@/docs/components/Preview";

export function Example1() {
  return (
<ConfigPreview
  label="Example"
  componentConfig={{
    fields: {
      items: {
        type: "array",
        arrayFields: {
          title: { type: "text" },
        },
      },
    },
    defaultProps: { items: [{ title: "Apple" }, { title: "Banana" }] },
    render: ({ items }) => {
      return (
        <ul>
          {items.map((item, i) => (
            <li key={i}>{item.title}</li>
          ))}
        </ul>
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
      items: {
        type: "array",
        arrayFields: {
          title: { type: "text" },
        },
        defaultItemProps: {
          title: "Hello, world",
        },
      },
    },
    defaultProps: { items: [{ title: "Apple" }, { title: "Banana" }] },
    render: ({ items }) => {
      return (
        <ul>
          {items.map((item, i) => (
            <li key={i}>{item.title}</li>
          ))}
        </ul>
      );
    },
  }}
/>
  );
}

export function Example3() {
  return (
<ConfigPreview
  label="Dynamic Example"
  componentConfig={{
    fields: {
      items: {
        type: "array",
        arrayFields: {
          title: { type: "text" },
          order: { type: "number" },
        },
        defaultItemProps: (index) => ({
          title: `Item ${index + 1}`,
          order: index + 1,
        }),
      },
    },
    defaultProps: { items: [] },
    render: ({ items }) => {
      return (
        <ul>
          {items.map((item, i) => (
            <li key={i}>
              {item.title} (Order: {item.order})
            </li>
          ))}
        </ul>
      );
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
      items: {
        type: "array",
        arrayFields: {
          title: { type: "text" },
        },
        getItemSummary: (item) => item.title || "Item",
      },
    },
    defaultProps: { items: [{ title: "Apple" }, { title: "Banana" }] },
    render: ({ items }) => {
      return (
        <ul>
          {items.map((item, i) => (
            <li key={i}>{item.title}</li>
          ))}
        </ul>
      );
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
      items: {
        type: "array",
        max: 3,
        arrayFields: {
          title: { type: "text" },
        },
      },
    },
    defaultProps: { items: [{ title: "Apple" }, { title: "Banana" }] },
    render: ({ items }) => {
      return (
        <ul>
          {items.map((item, i) => (
            <li key={i}>{item.title}</li>
          ))}
        </ul>
      );
    },
  }}
/>
  );
}

export function Example6() {
  return (
<ConfigPreview
  label="Example"
  componentConfig={{
    fields: {
      items: {
        type: "array",
        min: 1,
        arrayFields: {
          title: { type: "text" },
        },
      },
    },
    defaultProps: { items: [{ title: "Apple" }, { title: "Banana" }] },
    render: ({ items }) => {
      return (
        <ul>
          {items.map((item, i) => (
            <li key={i}>{item.title}</li>
          ))}
        </ul>
      );
    },
  }}
/>
  );
}

