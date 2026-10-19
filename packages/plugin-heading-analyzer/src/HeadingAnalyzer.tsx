import { useEffect, useState } from "react";

import styles from "./HeadingAnalyzer.module.css";

import { createUsePuck } from "@puckeditor/core";
import { Plugin } from "@/core/types";

import { getFrame } from "@/core/lib/get-frame";

import { Heading1 } from "lucide-react";

import { getClassNameFactory } from "@/core/lib";
import { buildHeadingHierarchy, type HeadingBlock } from "./heading-tree";
import { HeadingOutline } from "./HeadingOutline";

const getClassName = getClassNameFactory("HeadingAnalyzer", styles);

const usePuck = createUsePuck();

export const HeadingAnalyzer = () => {
  const data = usePuck((s) => s.appState.data);
  const [hierarchy, setHierarchy] = useState<HeadingBlock[]>([]);

  // Re-render when content changes
  useEffect(() => {
    const frame = getFrame();

    let entry = frame?.querySelector(`[data-puck-entry]`);

    const createHierarchy = () => {
      setHierarchy(buildHeadingHierarchy(entry ?? undefined));
    };
    const entryObserver = new MutationObserver(() => {
      createHierarchy();
    });

    const frameObserver = new MutationObserver(() => {
      entry = frame?.querySelector(`[data-puck-entry]`);

      if (entry) {
        registerEntryObserver();
        frameObserver.disconnect();
      }
    });

    const registerEntryObserver = () => {
      if (!entry) return;
      entryObserver.observe(entry, { subtree: true, childList: true });
    };

    const registerFrameObserver = () => {
      if (!frame) return;
      frameObserver.observe(frame, { subtree: true, childList: true });
    };

    if (entry) {
      createHierarchy();
      registerEntryObserver();
    } else {
      registerFrameObserver();
    }

    return () => {
      entryObserver.disconnect();
      frameObserver.disconnect();
    };
  }, [data]);

  return (
    <div className={getClassName()}>
      <small
        className={getClassName("cssWarning")}
        style={{
          color: "var(--puck-color-red-04)",
          display: "block",
          marginBottom: 16,
        }}
      >
        Heading analyzer styles not loaded. Please review the{" "}
        <a href="https://github.com/puckeditor/puck/blob/main/packages/plugin-heading-analyzer/README.md">
          README
        </a>
        .
      </small>

      {hierarchy.length === 0 && <div>No headings.</div>}

      <HeadingOutline blocks={hierarchy} />
    </div>
  );
};

const headingAnalyzer: Plugin = {
  name: "heading-analyzer",
  label: "Audit",
  render: HeadingAnalyzer,
  icon: <Heading1 />,
};

export default headingAnalyzer;
