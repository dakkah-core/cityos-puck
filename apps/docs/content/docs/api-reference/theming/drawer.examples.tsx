"use client";

import { PuckPreview } from "@/docs/components/Preview";
import { Drawer } from "@/puck";

export function Example1() {
  return (
<PuckPreview
  config={{
    components: {
      Heading: { render: () => <div>Heading</div> },
      Paragraph: { render: () => <div>Paragraph</div> },
    },
  }}
  data={{ root: { props: {} }, content: [] }}
>
  <div
    style={{
      "--puck-drawer-item-color-bg": "#1e1e2e",
      "--puck-drawer-item-color-text": "#cdd6f4",
      "--puck-drawer-item-radius": "12px",
    }}
  >
    <Drawer>
      <Drawer.Item name="Heading" />
      <Drawer.Item name="Paragraph" />
    </Drawer>
  </div>
</PuckPreview>
  );
}

