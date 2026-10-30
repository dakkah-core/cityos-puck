"use client";

import { ConfigPreview } from "@/docs/components/Preview";
import { FieldTab } from "@/puck";

export function Example1() {
  return (
    <ConfigPreview
      label="Example"
      componentConfig={{
        fields: {
          title: { type: "text" },
          size: {
            type: "radio",
            options: [
              { label: "Small", value: "s" },
              { label: "Large", value: "l" },
            ],
          },
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
            <FieldTab label="Style">
              {fields.size}
              {fields.weight}
            </FieldTab>
          </>
        ),
        defaultProps: { title: "Hello, world", size: "l", weight: "regular" },
        render: ({ title, weight, size }) => {
          return (
            <p
              style={{
                margin: 0,
                fontWeight:
                  weight === "thin"
                    ? "100"
                    : weight === "regular"
                      ? "400"
                      : "700",
                fontSize: size === "s" ? "12px" : "24px",
              }}
            >
              {title}
            </p>
          );
        },
      }}
    />
  );
}
