"use client";

import { PuckPreview } from "@/docs/components/Preview";
import { Drawer } from "@/puck";

export function Example1() {
  return (
<PuckPreview config={{ components: {} }} data={{ root: { props: {} }, content: [] }}>
  <Drawer>
    <Drawer.Item name="Orange">{() => <div>Orange 🍊</div>}</Drawer.Item>
  </Drawer>
</PuckPreview>
  );
}

