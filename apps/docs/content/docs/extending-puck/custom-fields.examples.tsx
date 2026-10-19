"use client";

import { ConfigPreview } from "@/docs/components/Preview";
import { AutoField, FieldLabel } from "@/puck";

export function Example1() {
  return (
<ConfigPreview
  label="Example"
  componentConfig={{
    fields: {
      title: {
        type: "custom",
        render: ({ name, onChange, value }) => {
          return (
            <input
              defaultValue={value}
              name={name}
              onChange={(e) => onChange(e.currentTarget.value)}
              style={{
                background: "white",
                border: "1px solid black",
                padding: 4,
              }}
            />
          );
        },
      },
    },
    defaultProps: {
      title: "Hello, world",
    },
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
        type: "custom",
        label: "Label Example",
        render: ({ field, name, onChange, value }) => {
          return (
            <FieldLabel label={field.label}>
              <input
                defaultValue={value}
                name={name}
                onChange={(e) => onChange(e.currentTarget.value)}
                style={{
                  background: "white",
                  border: "1px solid black",
                  padding: 4,
                }}
              />
            </FieldLabel>
          );
        },
      },
    },
    defaultProps: {
      title: "Hello, world",
    },
    render: ({ title }) => {
      return <p style={{ margin: 0 }}>{title}</p>;
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
      title: {
        type: "custom",
        label: "AutoField Example",
        render: ({ field, value, onChange }) => {
          return (
            <FieldLabel label={field.label}>
              <AutoField
                field={{ type: "text" }}
                value={value}
                onChange={onChange}
              />
            </FieldLabel>
          );
        },
      },
    },
    defaultProps: {
      title: "Hello, world",
    },
    render: ({ title }) => {
      return <p style={{ margin: 0 }}>{title}</p>;
    },
  }}
/>
  );
}

