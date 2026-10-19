"use client";

import { ConfigPreview, PuckPreview } from "@/docs/components/Preview";
import { Drawer } from "@/puck";

export function Example1() {
  return (
<ConfigPreview
  label="Example"
  componentConfig={{
    fields: {
      title: {
        type: "text",
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
        type: "text",
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
        type: "text",
      },
    },
    defaultProps: {
      title: "Hello, world",
    },
    inline: true,
    render: ({ title, puck }) => {
      return (
        <p style={{ margin: 0 }} ref={puck.dragRef}>
          {title}
        </p>
      );
    },
  }}
/>
  );
}

export function Example4() {
  return (
<PuckPreview config={{}} data={{ root: { props: {} }, content: [] }}>
  <Drawer>
    <Drawer.Item name="Heading Block" />
  </Drawer>
</PuckPreview>
  );
}

export function Example5() {
  return (
<ConfigPreview
  label='Try changing the "title" field'
  componentConfig={{
    fields: {
      title: {
        type: "text",
      },
      resolvedTitle: {
        type: "text",
      },
    },
    defaultProps: {
      title: "Hello, world",
    },
    resolveData: ({ props }) => {
      return {
        props: { resolvedTitle: props.title },
        readOnly: { resolvedTitle: true },
      };
    },
    render: ({ resolvedTitle }) => {
      return <p style={{ margin: 0 }}>{resolvedTitle}</p>;
    },

}}
/>
  );
}

export function Example6() {
  return (
<ConfigPreview
  label='Try changing the "drink" field'
  componentConfig={{
    resolveFields: (data) => {
      const fields = {
        drink: {
          type: "radio",
          options: [
            { label: "Water", value: "water" },
            { label: "Orange juice", value: "orange-juice" },
          ],
        },
      };

      if (data.props.drink === "water") {
        return {
          ...fields,
          waterType: {
            type: "radio",
            options: [
              { label: "Still", value: "still" },
              { label: "Sparkling", value: "sparkling" },
            ],
          },
        };
      }

      return fields;
    },
    defaultProps: {
      drink: "water",
      waterType: "still",
    },
    render: ({ drink, waterType }) => (
      <p>
        {drink}
        {drink === "water" ? ` (${waterType})` : ""}
      </p>
    ),

}}
/>
  );
}

