"use client";

import { PuckPreview } from "@/docs/components/Preview";
import { Puck } from "@/puck";

export function Example1() {
  return (
<PuckPreview
  config={{
    components: {
      HeadingBlock: {
        fields: {title: {type: 'text'}},
        render: ({title}) => <div>{title}</div>
      }
    }
  }}
  data={{
    root: { props: {} },
    content: [{ type: "HeadingBlock", props: { id: "HeadingBlock-123", title: 'Hello, world' } }],
  }}
>

  <Puck.Preview />
</PuckPreview>
  );
}

