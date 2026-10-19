import { act } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { PuckRichText } from "../extension";
import { RichTextRender } from "../components/Render";
import { renderRichTextHTML } from "../lib/render-rich-text";

describe("rich text browser parsing boundary", () => {
  it("normalizes browser HTML through the configured Tiptap schema", () => {
    expect(renderRichTextHTML('<p data-unregistered="discard"><b>Hello</b> <em>world</em></p>', [PuckRichText], true)).toBe("<p><strong>Hello</strong> <em>world</em></p>");
  });

  it("hydrates the existing HTML fallback before applying browser normalization", async () => {
    const content = '<p data-unregistered="discard"><b>Hello</b></p>';
    const container = document.createElement("div");
    container.innerHTML = '<div class="RichTextEditor"><div class="rich-text">' + content + "</div></div>";
    document.body.append(container);
    const recoverable = jest.fn();
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, <RichTextRender content={content} field={{ type: "richtext" }} />, { onRecoverableError: recoverable });
      });
      expect(recoverable).not.toHaveBeenCalled();
      expect(container.querySelector(".rich-text")?.innerHTML).toBe("<p><strong>Hello</strong></p>");
    } finally {
      await act(async () => root?.unmount());
      container.remove();
    }
  });
});
