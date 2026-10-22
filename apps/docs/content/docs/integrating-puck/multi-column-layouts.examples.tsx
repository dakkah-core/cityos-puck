"use client";

import { PuckPreview } from "@/docs/components/Preview";
import { Puck } from "@/puck";

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
>
  <Puck.Preview />
</PuckPreview>
  );
}

export function Example2() {
  return (
<PuckPreview
  label="Fixed layout example"
  config={{
    root: {
      render: ({ puck: { renderDropZone: DropZone } }) => (
        <DropZone zone="default-zone" disallow={["Card"]} />
      ),
    },
    components: {
      Example: {
        fields: {
          leftColumn: {
            type: "slot",
          },
          rightColumn: {
            type: "slot",
          },
        },
        render: ({ leftColumn: LeftColumn, rightColumn: RightColumn }) => {
          return (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
              }}
            >
              <LeftColumn />
              <RightColumn />
            </div>
          );
        },
      },
      Card: {
        render: ({ content }) => {
          return (
            <div
              style={{
                background: "white",
                border: "1px solid black",
                borderRadius: 4,
                padding: 16,
              }}
            >
              {content}
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
          leftColumn: [
            {
              type: "Card",
              props: { id: "Example-2", content: "1" },
            },
          ],
          rightColumn: [
            {
              type: "Card",
              props: { id: "Example-3", content: "2" },
            },
          ],
        },
      },
    ],
    root: { props: {} },
  }}
>
  <Puck.Preview />
</PuckPreview>
  );
}

export function Example3() {
  return (
<PuckPreview
  label="Fluid layout using CSS grid"
  config={{
    root: {
      fields: {
        content: {
          type: "slot",
        },
      },
      render: (props) => (
        <props.content
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr",
            gap: 16,
          }}
        />
      ),
    },
    components: {
      Card: {
        render: ({ content }) => {
          return (
            <div
              style={{
                background: "white",
                border: "1px solid black",
                borderRadius: 4,
                padding: 16,
              }}
            >
              {content}
            </div>
          );
        },
      },
    },
  }}
  data={{
    content: [],
    root: {
      props: {
        content: [
          {
            type: "Card",
            props: { id: "Example-2", content: "1" },
          },
          {
            type: "Card",
            props: { id: "Example-3", content: "2" },
          },
        ],
      },
    },
  }}
>
  <Puck.Preview />
</PuckPreview>
  );
}

export function Example4() {
  return (
<PuckPreview
  label="Advanced grid example"
  config={{
    root: {
      fields: {
        Content: {
          type: "slot",
        },
      },
      render: (props) => (
        <props.Content
          zone="default-zone"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr 1fr",
            gridTemplateRows: "1fr 1fr 1fr",
            gap: 16,
          }}
        />
      ),
    },
    components: {
      Card: {
        inline: true,
        render: ({ content, spanCol, spanRow, puck }) => {
          return (
            <div
              style={{
                background: "white",
                border: "1px solid black",
                borderRadius: 4,
                padding: 16,
                gridColumn: `span ${spanCol}`,
                gridRow: `span ${spanRow}`,
              }}
              // Let Puck know this element is draggable
              ref={puck.dragRef}
            >
              {content}
            </div>
          );
        },
      },
    },

}}
data={{
    content: [],
    root: {
      props: {
        Content: [
          {
            type: "Card",
            props: { id: "Example-1", content: "1", spanCol: 2, spanRow: 2 },
          },
          {
            type: "Card",
            props: { id: "Example-2", content: "2", spanCol: 1, spanRow: 1 },
          },
          {
            type: "Card",
            props: { id: "Example-3", content: "3", spanCol: 1, spanRow: 1 },
          },
          {
            type: "Card",
            props: { id: "Example-4", content: "4", spanCol: 2, spanRow: 1 },
          },
          {
            type: "Card",
            props: { id: "Example-5", content: "5", spanCol: 1, spanRow: 1 },
          },
        ],
      },
    },
  }}
/>
  );
}

export function Example5() {
  return (
<PuckPreview
  label="Fluid layout using CSS grid"
  config={{
    root: {
      fields: {
        content: {
          type: "slot",
        },
      },
      defaultProps: {
        content: [
          {
            type: "Card",
            props: {
              text: "Pre-populated",
            },
          },
        ],
      },
      render: (props) =>
        props.content({
          style: {
            display: "grid",
            gridTemplateColumns: "2fr 1fr",
            gap: 16,
          },
        }),
    },
    components: {
      Card: {
        render: ({ content }) => {
          return (
            <div
              style={{
                background: "white",
                border: "1px solid black",
                borderRadius: 4,
                padding: 16,
              }}
            >
              {content}
            </div>
          );
        },
      },
    },
  }}
  data={{
    content: [],
    root: {
      props: {
        content: [
          {
            type: "Card",
            props: { id: "Example-2", content: "Pre-populated" },
          },
        ],
      },
    },
  }}
>
  <Puck.Preview />
</PuckPreview>
  );
}

