"use client";

import { PuckPreview } from "@/docs/components/Preview";
import { ActionBar } from "@/puck";

export function Example1() {
  return (
<PuckPreview>
  <div style={{ display: "flex" }}>
    <ActionBar>
      <ActionBar.Action onClick={() => console.log("Clicked!")}>
        ★
      </ActionBar.Action>
    </ActionBar>
  </div>
</PuckPreview>
  );
}

