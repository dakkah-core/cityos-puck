import { OutlineList } from "../../core/components/OutlineList";
import { scrollIntoView } from "../../core/lib/scroll-into-view";
import getClassNameFactory from "../../core/lib/get-class-name-factory";
import type { HeadingBlock } from "./heading-tree";
import styles from "./HeadingAnalyzer.module.css";

const getClassNameItem = getClassNameFactory("HeadingAnalyzerItem", styles);

export function HeadingOutline({ blocks }: { blocks: readonly HeadingBlock[] }) {
  return (
    <OutlineList>
      {blocks.map((block, index) => (
        <OutlineList.Item key={`${index}:${block.rank}`}>
          <OutlineList.Clickable>
            <small
              className={getClassNameItem({ missing: block.missing })}
              onClick={block.element ? (event) => {
                event.stopPropagation();
                const element = block.element!;
                const { outline, outlineOffset } = element.style;
                scrollIntoView(element);
                element.style.outline = "4px solid var(--puck-color-rose-06)";
                element.style.outlineOffset = "4px";
                setTimeout(() => {
                  element.style.outline = outline;
                  element.style.outlineOffset = outlineOffset;
                }, 2000);
              } : undefined}
            >
              <b>H{block.rank}</b>: {block.missing ? "Missing" : block.text}
            </small>
          </OutlineList.Clickable>
          <HeadingOutline blocks={block.children ?? []} />
        </OutlineList.Item>
      ))}
    </OutlineList>
  );
}
