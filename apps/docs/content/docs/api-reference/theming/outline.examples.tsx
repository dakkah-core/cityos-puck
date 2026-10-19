"use client";

import { PuckPreview } from "@/docs/components/Preview";
import { Puck } from "@/puck";

export function Example1() {
  return (
<PuckPreview
  disableContentStyles
  config={{
    components: {
      Heading: { render: () => <div>Heading</div> },
      Paragraph: { render: () => <div>Paragraph</div> },
    },
  }}
  data={{
    root: { props: {} },
    content: [
      { type: "Heading", props: { id: "Heading-1" } },
      { type: "Paragraph", props: { id: "Paragraph-1" } },
    ],
  }}
  ui={{ itemSelector: { index: 0 } }}
>
  <div
    style={{
      "--puck-outline-color-bg-selected": "#f0f0f0",
      "--puck-outline-color-border-selected": "#b947ff",
    }}
  >
    <Puck.Outline />
  </div>
</PuckPreview>
  );
}

