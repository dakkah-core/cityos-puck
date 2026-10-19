"use client";

import { ConfigPreview, PuckPreview } from "@/docs/components/Preview";
import { Puck, RichTextMenu } from "@/puck";

export function Example1() {
  return (
<ConfigPreview
  label="Example"
  componentConfig={{
    fields: {
      body: {
        type: "richtext",
      },
    },
    defaultProps: {
      body: "<p>Hello, <strong>world</strong></p><ul><li><p>List item 1</p></li><li><p>List item 2</p></li><li><p>List item 3</p></li></ul>",
    },
    render: ({ body }) => {
      return body;
    },
  }}
>
  <Puck.Preview />
</ConfigPreview>
  );
}

export function Example2() {
  return (
<ConfigPreview
  label="Example"
  componentConfig={{
    fields: {
      body: {
        type: "richtext",
        contentEditable: true,
      },
    },
    defaultProps: {
      body: "<p>Edit me <strong>inline:</strong></p><ul><li><p>List item 1</p></li><li><p>List item 2</p></li><li><p>List item 3</p></li></ul>",
    },
    render: ({ body }) => {
      return body;
    },
  }}
  hideActionBar={false}
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
      body: {
        type: "richtext",
        options: { bold: false },
      },
    },
    defaultProps: {
      body: "<p>Hello, <strong>world</strong></p>", // Check sanitization
    },
    render: ({ body }) => {
      return body;
    },
  }}
>
  <Puck.Preview />
</ConfigPreview>
  );
}

export function Example4() {
  return (
<ConfigPreview
  label="Example"
  componentConfig={{
    fields: {
      body: {
        type: "richtext",
        options: { heading: { levels: [1, 2] } },
      },
    },
    defaultProps: {
      body: "<p>Hello, <strong>world</strong></p>",
    },
    render: ({ body }) => {
      return body;
    },
  }}
>
  <Puck.Preview />
</ConfigPreview>
  );
}

export function Example5() {
  return (
<ConfigPreview
  label="Example"
  componentConfig={{
    fields: {
      body: {
        type: "richtext",
        renderMenu: () => (
          <RichTextMenu>
            <RichTextMenu.Group>
              <RichTextMenu.Bold />
            </RichTextMenu.Group>
          </RichTextMenu>
        ),
      },
    },
    defaultProps: {
      body: "<p>Hello, <strong>world</strong></p>",
    },
    render: ({ body }) => {
      return body;
    },
  }}
>
  <Puck.Preview />
</ConfigPreview>
  );
}

