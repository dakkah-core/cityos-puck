"use client";

import { Puck, RichTextMenu } from "@/puck";
import { ConfigPreview, PuckPreview } from "@/docs/components/Preview";
import { Highlighter } from "lucide-react";

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
      body: "<p>Hello, <strong>world</strong></p>",
    },
    render: ({ body }) => body,
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
      body: "<p>Edit me <strong>inline</strong></p>",
    },
    render: ({ body }) => body,
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
      body: {
        type: "richtext",
        contentEditable: true,
        options: {
          bold: false,
          heading: { levels: [1, 2] },
        },
      },
    },
    defaultProps: {
      body: "<p>Hello, world</p>",
    },
    render: ({ body }) => body,
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
        renderMenu: ({ children }) => (
          <RichTextMenu>
            {children}
            <RichTextMenu.Group>
              <RichTextMenu.Blockquote />
              <RichTextMenu.Control
                icon={<Highlighter />}
                title="Highlight"
                onClick={() => {
                  alert("Highlight clicked");
                }}
              />
            </RichTextMenu.Group>
          </RichTextMenu>
        ),
      },
    },
    defaultProps: {
      body: "<p>Hello, world</p>",
    },
    render: ({ body }) => body,
  }}
>
  <Puck.Preview />
</ConfigPreview>
  );
}

export function Example5() {
  return (
<PuckPreview
  config={{
    components: {
      Example: {
        fields: {
          body: {
            type: "richtext",
            contentEditable: true,
            renderInlineMenu: ({ children }) => (
              <RichTextMenu>
                {children}
                <RichTextMenu.Group>
                  <RichTextMenu.Blockquote />
                  <RichTextMenu.Control
                    icon={<Highlighter />}
                    title="Highlight"
                    onClick={() => {
                      alert("Highlight clicked");
                    }}
                  />
                </RichTextMenu.Group>
              </RichTextMenu>
            ),
          },
        },
        permissions: { drag: false, delete: false, duplicate: false },
        render: ({ body }) => body,
      },
    },
  }}
  data={{
    root: { props: {} },
    content: [
      {
        type: "Example",
        props: {
          id: "Example-1",
          body: "<p>Hello, <strong>world</strong></p>",
        },
      },
    ],
  }}
>
  <Puck.Preview />
</PuckPreview>
  );
}

