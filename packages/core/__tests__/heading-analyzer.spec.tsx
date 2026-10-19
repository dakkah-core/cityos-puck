import { fireEvent, render, screen } from "@testing-library/react";
import { buildHeadingHierarchy } from "../../plugin-heading-analyzer/src/heading-tree";
import { HeadingOutline } from "../../plugin-heading-analyzer/src/HeadingOutline";
import { scrollIntoView } from "../lib/scroll-into-view";

jest.mock("../lib/scroll-into-view", () => ({ scrollIntoView: jest.fn() }));

describe("owned React 19 heading outline", () => {
  it("preserves document order, missing levels, repeated labels, and h1 resets", () => {
    const frame = document.createElement("main");
    frame.innerHTML = '<h1>Repeated</h1><h3>Nested</h3><h2>Sibling</h2><div data-dnd-dragging><h2>Dragged copy</h2></div><h1>Repeated</h1><h2>Final</h2>';
    const tree = buildHeadingHierarchy(frame);
    expect(tree.map((block) => block.text)).toEqual(["Repeated", "Repeated"]);
    expect(tree[0].children?.map(({ rank, missing, text }) => ({ rank, missing, text }))).toEqual([
      { rank: 2, missing: true, text: "" },
      { rank: 2, missing: undefined, text: "Sibling" },
    ]);
    expect(tree[0].children?.[0].children?.[0].element).toBe(frame.querySelector("h3"));
    const { container } = render(<HeadingOutline blocks={tree} />);
    expect([...container.querySelectorAll("small")].map((element) => element.textContent)).toEqual([
      "H1: Repeated", "H2: Missing", "H3: Nested", "H2: Sibling", "H1: Repeated", "H2: Final",
    ]);
    expect(container.querySelectorAll("li")).toHaveLength(6);
    expect(buildHeadingHierarchy()).toEqual([]);
    expect(buildHeadingHierarchy(document.createElement("main"))).toEqual([]);
  });

  it("selects the actual heading, stops editor clicks, and restores existing inline styles", () => {
    jest.useFakeTimers();
    try {
      const element = document.createElement("h2");
      element.style.outline = "1px dashed red";
      element.style.outlineOffset = "2px";
      const previous = { outline: element.style.outline, outlineOffset: element.style.outlineOffset };
      const outerClick = jest.fn();
      render(<div onClick={outerClick}><HeadingOutline blocks={[{ rank: 2, text: "Select heading", element }]} /></div>);
      fireEvent.click(screen.getByText(/Select heading/));
      expect(scrollIntoView).toHaveBeenCalledWith(element);
      expect(outerClick).not.toHaveBeenCalled();
      expect(element.style.outlineOffset).toBe("4px");
      jest.advanceTimersByTime(2000);
      expect(element.style.outline).toBe(previous.outline);
      expect(element.style.outlineOffset).toBe(previous.outlineOffset);
    } finally {
      jest.useRealTimers();
    }
  });

  it("renders missing-level placeholders without a DOM selection action", () => {
    jest.mocked(scrollIntoView).mockClear();
    render(<HeadingOutline blocks={[{ rank: 1, text: "", missing: true }]} />);
    fireEvent.click(screen.getByText(/Missing/));
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
