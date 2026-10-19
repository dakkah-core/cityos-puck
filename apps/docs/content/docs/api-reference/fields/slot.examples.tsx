"use client";

import {
  ConfigPreview,
  PuckPreview,
  CodeBlockDrawer,
} from "@/docs/components/Preview";
import { usePuck } from "@/puck";

export function Example1() {
  return (
<PuckPreview
  label="Example"
  renderDrawer={() => {
    return (
      <CodeBlockDrawer getCode={(appState) => appState.data.content[0].props} />
    );
  }}
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
        permissions: {
          duplicate: false,
          delete: false,
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
    content: [
      {
        type: "Example",
        props: {
          id: "Example-1",
          content: [{ type: "Card", props: { id: "Example-2" } }],
        },
      },
    ],
    root: { props: {} },
  }}
/>
  );
}

