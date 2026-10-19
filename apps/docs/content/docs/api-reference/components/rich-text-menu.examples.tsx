"use client";

import { PuckPreview } from "@/docs/components/Preview";
import { RichTextMenu } from "@/puck";
import { Bold, Italic, Underline } from "lucide-react";

export function Example1() {
  return (
<PuckPreview>
  <div style={{ display: "flex" }}>
    <RichTextMenu>
      <RichTextMenu.Group>
        <RichTextMenu.Control icon={<Bold />} />
        <RichTextMenu.Control icon={<Italic />} />
        <RichTextMenu.Control icon={<Underline />} />
      </RichTextMenu.Group>
    </RichTextMenu>
  </div>
</PuckPreview>
  );
}

