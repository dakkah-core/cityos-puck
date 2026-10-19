"use client";

import { PuckPreview } from "@/docs/components/Preview";
import { Button } from "@/puck";

export function Example1() {
  return (
<PuckPreview>
  <div
    style={{
      "--puck-button-radius": "9999px",
      "--puck-button-primary-color-bg": "#6d28d9",
      "--puck-button-primary-color-bg-hover": "#5b21b6",
    }}
  >
    <Button>Publish</Button>
  </div>
</PuckPreview>
  );
}

