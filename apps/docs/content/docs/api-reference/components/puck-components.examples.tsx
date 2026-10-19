"use client";

import { PuckPreview } from "@/docs/components/Preview";
import { Puck } from "@/puck";

export function Example1() {
  return (
<PuckPreview
  config={{
    components: {
      HeadingBlock: {},
      ParagraphBlock: {},
    },
  }}
  data={{ root: { props: {} }, content: [] }}
>
  <Puck.Components />
</PuckPreview>
  );
}

