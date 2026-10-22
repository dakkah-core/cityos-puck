"use client";

import { PuckPreview } from "@/docs/components/Preview";
import { RichTextMenu } from "@/puck";

export function Example1() {
  return (
<PuckPreview>
  <div style={{ display: "flex" }}>
    <RichTextMenu>
      <RichTextMenu.Group>
        <RichTextMenu.Bold />
        <RichTextMenu.Italic />
        <RichTextMenu.Underline />
      </RichTextMenu.Group>
    </RichTextMenu>
  </div>
</PuckPreview>
  );
}

