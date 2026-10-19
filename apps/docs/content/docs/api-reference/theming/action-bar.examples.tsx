"use client";

import { PuckPreview } from "@/docs/components/Preview";
import { ActionBar } from "@/puck";
import { Color } from "@/docs/components/Color";

export function Example1() {
  return (
<PuckPreview>
  <div
    style={{
      "--puck-actionbar-color-bg": "darkgreen",
      "--puck-actionbar-color-action-hover": "white",
      "--puck-actionbar-radius": "999px",
    }}
  >
    <ActionBar label="Actions">
      <ActionBar.Group>
        <ActionBar.Action>★</ActionBar.Action>
      </ActionBar.Group>
    </ActionBar>
  </div>
</PuckPreview>
  );
}

