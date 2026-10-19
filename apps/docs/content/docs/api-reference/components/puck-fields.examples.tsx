"use client";

import { PuckPreview } from "@/docs/components/Preview";
import { Puck } from "@/puck";

export function Example1() {
  return (
<PuckPreview
  config={{
    components: {
      HeadingBlock: {},
    },
  }}
  data={{ root: { props: {} }, content: [] }}
  style={{ padding: 4 }}
>
  <Puck.Fields />
</PuckPreview>
  );
}

