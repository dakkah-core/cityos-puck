"use client";

import { ConfigPreview } from "../../../../components/Preview";
import { FieldLabel } from "@/puck";
import { Globe } from "lucide-react";

export function Example1() {
  return (
<ConfigPreview
  label="Example"
  componentConfig={{
    fields: {
      title: {
        type: "custom",
        render: () => {
          return (
            <FieldLabel label="Title">
              <input
                style={{ background: "white", border: "1px solid black" }}
              />
            </FieldLabel>
          );
        },
      },
    },
    defaultProps: {
      title: "Hello, world",
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
        render: () => {
          return (
            <FieldLabel label="Title" icon={<Globe size="16" />}>
              <input style={{ border: "1px solid black" }} />
            </FieldLabel>
          );
        },
      },
    },
    defaultProps: {
      title: "Hello, world",
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
        render: () => {
          return (
            <div style={{ maxWidth: "max-content" }}>
              <FieldLabel label="Title" readOnly>
                <input style={{ border: "1px solid black" }} readOnly />
              </FieldLabel>
            </div>
          );
        },
      },
    },
    defaultProps: {
      title: "Hello, world",
    },
  }}
/>
  );
}

