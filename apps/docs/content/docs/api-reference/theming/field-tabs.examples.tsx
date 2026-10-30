"use client";

import type { CSSProperties } from "react";

import { ConfigPreview } from "@/docs/components/Preview";
import { FieldTab } from "@/puck";

export function Example1() {
  return (
    <div
      style={
        {
          "--puck-fieldtabs-color-bg-selected": "#0158ad",
          "--puck-fieldtabs-color-text-selected": "#ffffff",
          "--puck-fieldtabs-radius": "999px",
        } as CSSProperties
      }
    >
      <ConfigPreview
        label="Example"
        componentConfig={{
          fields: {
            title: { type: "text" },
            weight: {
              type: "radio",
              options: [
                { label: "Thin", value: "thin" },
                { label: "Regular", value: "regular" },
                { label: "Bold", value: "bold" },
              ],
            },
          },
          renderFields: ({ fields }) => (
            <>
              <FieldTab label="Content">{fields.title}</FieldTab>
              <FieldTab label="Style">{fields.weight}</FieldTab>
            </>
          ),
          defaultProps: { title: "Hello, world", weight: "regular" },
          render: ({ title, weight }) => (
            <p
              style={{
                margin: 0,
                fontWeight:
                  weight === "thin"
                    ? "100"
                    : weight === "regular"
                      ? "400"
                      : "700",
              }}
            >
              {title}
            </p>
          ),
        }}
      />
    </div>
  );
}
