"use client";

import { PuckPreview } from "@/docs/components/Preview";
import { Puck, Drawer } from "@/puck";

export function Example1() {
  return (
<PuckPreview
  config={{ components: { Orange: { render: () => <div>Orange</div> } } }}
  data={{ root: { props: {} }, content: [] }}
>
  <Drawer>
    <Drawer.Item name="Orange" />
  </Drawer>
</PuckPreview>
  );
}

