"use client";

import {
  PuckPreview,
  OverlayPortalPreview,
  OverlayPortalTabsPreview,
} from "@/docs/components/Preview";
import { Puck } from "@/puck";

export function Example1() {
  return (
<PuckPreview
  label="Overlay Portals example"
  config={{
    components: {
      Example: {
        render: () => {
          return (
            <div style={{ padding: 32 }}>
              <OverlayPortalPreview />
            </div>
          );
        },
      },
    },
  }}
  data={{
    content: [
      {
        type: "Example",
        props: {
          id: "Example-1",
        },
      },
    ],
    root: { props: {} },
  }}
>
  <Puck.Preview />
</PuckPreview>
  );
}

export function Example2() {
  return (
<PuckPreview
  label="Tabs example"
  config={{
    components: {
      Example: {
        render: () => {
          return <OverlayPortalTabsPreview />;
        },
      },
    },
  }}
  data={{
    content: [
      {
        type: "Example",
        props: {
          id: "Example-1",
        },
      },
    ],
    root: { props: {} },
  }}
>
  <Puck.Preview />
</PuckPreview>
  );
}

