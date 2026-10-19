"use client";

import { PuckPreview } from "@/docs/components/Preview";
import { ActionBar } from "@/puck";

export function Example1() {
  return (
<PuckPreview>
  <div style={{ display: "flex" }}>
    <ActionBar>
      <ActionBar.Label label="Label 1" />
      <ActionBar.Group>
        <ActionBar.Label label="Label 2" />
        <ActionBar.Action>★</ActionBar.Action>
      </ActionBar.Group>
    </ActionBar>
  </div>
</PuckPreview>
  );
}

