"use client";

import { PuckPreview } from "@/docs/components/Preview";
import { IconButton } from "@/puck";
import { Trash } from "lucide-react";

export function Example1() {
  return (
<PuckPreview>
  <div
    style={{
      "--puck-iconbutton-radius": "9999px",
      "--puck-iconbutton-color-icon": "#1f2937",
      "--puck-iconbutton-color-bg-hover": "#eef2ff",
      "--puck-iconbutton-space": "16px",
    }}
  >
    <IconButton title="Delete">
      <Trash size={24} />
    </IconButton>
  </div>
</PuckPreview>
  );
}

