"use client";

import { PuckPreview } from "@/docs/components/Preview";
import { Puck } from "@/puck";

export function Example1() {
  return (
<PuckPreview
  config={{
    components: {
      HeadingBlock: { render: () => <div>Hello world</div> },
      ParagraphBlock: {},
    },
  }}
  data={{
    root: { props: {} },
    content: [{ type: "HeadingBlock", props: { id: "HeadingBlock-123" } }],
  }}
>
  <Puck.Outline />
  {/* Outline doesn't render unless Preview is rendered due to zone flushing */}
  <div style={{ display: "none" }}>
    <Puck.Preview />
  </div>
</PuckPreview>
  );
}

