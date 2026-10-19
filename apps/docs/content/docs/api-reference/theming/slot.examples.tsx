"use client";

import { PuckPreview } from "@/docs/components/Preview";
import { Puck } from "@/puck";
import { Color } from "@/docs/components/Color";

export function Example1() {
  return (
<PuckPreview
  label="Nested components example"
  config={{
    components: {
      Example: {
        fields: {
          content: {
            type: "slot",
          },
        },
        render: ({ content: Content }) => {
          return (
            <div style={{ padding: 32 }}>
              <Content />
            </div>
          );
        },
      },
      Card: {
        render: () => {
          return (
            <div
              style={{
                background: "white",
                border: "1px solid black",
                borderRadius: 4,
                padding: 16,
              }}
            >
              Hello, world
            </div>
          );
        },
      },
    },
  }}
  data={{
  }}
>

  <div
    style={{
      "--puck-slot-color-bg": "#fff2ee",
      "--puck-slot-color-border": "#f6823b",
    }}
  ><div style={{display:"grid", gridTemplateColumns: "1fr 2fr", gap: 8}}>
  <Puck.Components />
    <Puck.Preview />
  </div></div>
</PuckPreview>
  );
}

