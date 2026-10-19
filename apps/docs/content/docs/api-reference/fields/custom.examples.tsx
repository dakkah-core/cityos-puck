"use client";

import { Puck, FieldLabel, AutoField } from "@/puck";
import { ConfigPreview, PuckPreview } from "@/docs/components/Preview";

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
        contentEditable: true,
        render: ({ name, onChange, value }) => (
          <input
            value={value}
            name={name}
            onChange={(e) => onChange(e.currentTarget.value)}
            style={{
              background: "white",
              border: "1px solid black",
              padding: 4,
            }}
          />
        ),
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
      isText: {
        type: "radio",
        options: [
          { label: "Yes", value: true },
          { label: "No", value: false },
        ],
      },
    },
    resolveFields: (data, params) => {
      if (data.props.isText) {
        return {
          ...params.fields,
          title: {
            type: "custom",
            key: "custom-text",
            render: ({ onChange, value }) => (
              <FieldLabel label="Text Input">
                  <AutoField
                    field={{ type: "text" }}
                    value={value}
                    onChange={onChange}
                  />
              </FieldLabel>
            ),
          },
        };
      } else {
        return {
          ...params.fields,
          title: {
            type: "custom",
            key: "custom-number",
            render: ({ value, onChange }) => {
              return (
                <FieldLabel label="Number Input">
                  <AutoField
                    field={{ type: "number" }}
                    value={value}
                    onChange={onChange}
                  />
                </FieldLabel>
              );
            },
          },
        };
      }
    },
    resolveData: (data, params) => {
      if (!params.changed.isText) return data;

      if (data.props.isText) {
        return {
          ...data,
          props: {
            ...data.props,
            title: "Title",
          },
        };
      } else {
        return {
          ...data,
          props: {
            ...data.props,
            title: 123,
          },
        };
      }
    },
    defaultProps: {
      isText: true,
    },
    render: ({ title }) => {
      return <p style={{color: "black"}}>{title}</p>;
    },

}}

>

  <Puck.Preview />
</ConfigPreview>
  );
}

