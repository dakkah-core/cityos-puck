"use client";

import { ConfigPreview } from "@/docs/components/Preview";
import { AutoField } from "@/puck";

export function Example1() {
  return (
<ConfigPreview
  label="Example"
  componentConfig={{
    fields: {
      title: {
        type: "custom",
        render: ({ onChange, value }) => {
          return (
            <AutoField
              field={{ type: "text" }}
              onChange={onChange}
              value={value}
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

