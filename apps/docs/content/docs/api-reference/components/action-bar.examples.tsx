"use client";

import { PuckPreview } from "@/docs/components/Preview";
import { ActionBar } from "@/puck";

export function Example1() {
  return (
<PuckPreview>
  <div style={{ display: "flex" }}>
    <ActionBar label="Actions">
      <ActionBar.Group>
        <ActionBar.Action>★</ActionBar.Action>
      </ActionBar.Group>
    </ActionBar>
  </div>
</PuckPreview>
  );
}

