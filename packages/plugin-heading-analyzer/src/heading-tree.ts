export type HeadingBlock = {
  rank: number;
  text: string;
  children?: HeadingBlock[];
  missing?: boolean;
  element?: HTMLElement;
};

// This is the analyzer's actual DOM-derived schema, not a general JSON renderer.
export function buildHeadingHierarchy(frame?: Element | Document): HeadingBlock[] {
  const root: HeadingBlock = { rank: 0, text: "", children: [] };
  let path: HeadingBlock[] = [root];

  for (const element of frame?.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6") ?? []) {
    if (element.closest("[data-dnd-dragging]")) continue;
    const node: HeadingBlock = {
      rank: Number(element.tagName.slice(1)),
      text: element.textContent ?? "",
      children: [],
      element,
    };
    if (node.rank === 1) path = [root];
    else {
      while (path[path.length - 1].rank >= node.rank) path.pop();
      while (path.length < node.rank) {
        const missing: HeadingBlock = { rank: path.length, text: "", missing: true, children: [] };
        path[path.length - 1].children!.push(missing);
        path.push(missing);
      }
    }
    path[path.length - 1].children!.push(node);
    path.push(node);
  }

  return root.children!;
}
