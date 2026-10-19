"use client";

import { PuckPreview } from "@/docs/components/Preview";
import { Puck } from "@/puck";

export function Example1() {
  return (
<PuckPreview
  config={{
    components: {
      HeadingBlock: {
        render: () => {
          return <span>Hello, world</span>;
        },
      },
    },
  }}
  data={{
    content: [{ type: "HeadingBlock", props: { id: "HeadingBlock-1" } }],
    root: { props: {} },
  }}
>
  <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gridGap: 16 }}>
    <div>
      <Puck.Components />
    </div>
    <div>
      <Puck.Preview />
    </div>
  </div>
</PuckPreview>
  );
}

