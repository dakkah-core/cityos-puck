/** @jest-environment node */
import { renderToString } from "react-dom/server";
import { Node } from "@tiptap/core";
import { PuckRichText } from "../extension";
import { RichTextRender } from "../components/Render";
import { renderRichTextHTML } from "../lib/render-rich-text";

describe("rich text static/server boundary", () => {
  it("renders JSON marks and escaped plain text without window, document, or Happy DOM", () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
    const extensions = [PuckRichText];
    expect(renderRichTextHTML({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "A & B", marks: [{ type: "bold" }] }] }] }, extensions, false)).toBe("<p><strong>A &amp; B</strong></p>");
    expect(renderRichTextHTML("Plain & text", extensions, false)).toBe("<p>Plain &amp; text</p>");
    expect(renderRichTextHTML("", extensions, false)).toBe("");
  });

  it("retains configured extension renderHTML and node attributes", () => {
    const callout = Node.create({
      name: "callout", group: "block", content: "inline*",
      addAttributes: () => ({ tone: { default: "info" } }),
      renderHTML: ({ HTMLAttributes }) => ["aside", { "data-tone": HTMLAttributes.tone }, 0],
    });
    expect(renderRichTextHTML({ type: "doc", content: [{ type: "callout", attrs: { tone: "warning" }, content: [{ type: "text", text: "Custom" }] }] }, [PuckRichText, callout], false)).toBe('<aside data-tone="warning">Custom</aside>');
  });

  it("preserves HTML fallback markup during server rendering and first hydration", () => {
    const html = '<p data-fixture="ssr"><strong>Existing HTML</strong></p>';
    expect(renderRichTextHTML(html, [PuckRichText], false)).toBe(html);
    expect(renderToString(<RichTextRender content={html} field={{ type: "richtext" }} />)).toContain(html);
  });
});
