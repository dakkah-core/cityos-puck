import { generateJSON, type Extensions, type JSONContent } from "@tiptap/core";
import { renderToHTMLString } from "@tiptap/static-renderer/pm/html-string";

export function renderRichTextHTML(
  content: string | JSONContent,
  extensions: Extensions,
  browserReady: boolean,
): string {
  let normalized: JSONContent = { type: "doc", content: [] };
  if (typeof content === "object" && content?.type === "doc")
    normalized = content;
  else if (typeof content === "string" && content) {
    if (/<\/?[a-z][\s\S]*>/i.test(content)) {
      // Match the existing HTML fallback on the server and during hydration.
      // HTML parsing uses the real browser DOM after hydration; no server DOM shim.
      if (!browserReady) return content;
      normalized = generateJSON(content, extensions);
    } else {
      normalized = {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: content }] },
        ],
      };
    }
  }
  return renderToHTMLString({ content: normalized, extensions });
}
