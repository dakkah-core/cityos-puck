"use client";

import { PuckPreview } from "@/docs/components/Preview";
import { ActionBar } from "@/puck";

export function Example1() {
  return (
    <PuckPreview>
      <div style={{ display: "flex" }}>
        <ActionBar>
          <ActionBar.Group>
            <ActionBar.DragHandle label="Drag to reorder" />
          </ActionBar.Group>
        </ActionBar>
      </div>
    </PuckPreview>
  );
}
