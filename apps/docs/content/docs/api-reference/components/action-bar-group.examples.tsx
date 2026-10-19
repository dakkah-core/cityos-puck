"use client";

import { PuckPreview } from "@/docs/components/Preview";
import { ActionBar } from "@/puck";

export function Example1() {
  return (
<PuckPreview>
  <div style={{ display: "flex" }}>
    <ActionBar label="Actions">
      <ActionBar.Group>Group 1</ActionBar.Group>
      <ActionBar.Group>Group 2</ActionBar.Group>
    </ActionBar>
  </div>
</PuckPreview>
  );
}

