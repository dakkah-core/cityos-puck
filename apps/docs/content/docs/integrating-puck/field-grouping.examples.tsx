"use client";

import { ConfigPreview, PuckPreview } from "@/docs/components/Preview";
import { FieldGroup, FieldTab } from "@/puck";

export function Example1() {
  return (
    <ConfigPreview
      label="Custom field layout"
      componentConfig={{
        fields: {
          title: { type: "text" },
          weight: {
            type: "radio",
            options: [
              { label: "Light", value: "light" },
              { label: "Bold", value: "bold" },
            ],
          },
          size: { type: "number", min: 16, max: 64 },
        },
        renderFields: ({ fields }) => (
          <>
            {fields.title}
            {fields.size}
            {fields.weight}
          </>
        ),
        defaultProps: {
          title: "Hello, world",
          weight: "light",
          size: 24,
        },
        render: ({ title, weight, size }) => (
          <p
            style={{
              fontSize: size,
              fontWeight: weight === "light" ? 300 : 700,
              margin: 0,
            }}
          >
            {title}
          </p>
        ),
      }}
    />
  );
}

export function Example2() {
  return (
    <ConfigPreview
      label="Field group"
      componentConfig={{
        fields: {
          title: { type: "text" },
          weight: {
            type: "radio",
            options: [
              { label: "Light", value: "light" },
              { label: "Bold", value: "bold" },
            ],
          },
          size: { type: "number", min: 16, max: 64 },
        },
        renderFields: ({ fields }) => (
          <>
            {fields.title}
            <FieldGroup label="Appearance">
              {fields.weight}
              {fields.size}
            </FieldGroup>
          </>
        ),
        defaultProps: {
          title: "Hello, world",
          weight: "light",
          size: 24,
        },
        render: ({ title, weight, size }) => (
          <p
            style={{
              fontSize: size,
              fontWeight: weight === "light" ? 300 : 700,
              margin: 0,
            }}
          >
            {title}
          </p>
        ),
      }}
    />
  );
}

export function Example3() {
  return (
    <ConfigPreview
      label="Field group expanded by default"
      componentConfig={{
        fields: {
          title: { type: "text" },
          weight: {
            type: "radio",
            options: [
              { label: "Light", value: "light" },
              { label: "Bold", value: "bold" },
            ],
          },
          size: { type: "number", min: 16, max: 64 },
        },
        renderFields: ({ fields }) => (
          <>
            {fields.title}
            <FieldGroup label="Appearance" defaultExpanded={true}>
              {fields.weight}
              {fields.size}
            </FieldGroup>
          </>
        ),
        defaultProps: {
          title: "Hello, world",
          weight: "light",
          size: 24,
        },
        render: ({ title, weight, size }) => (
          <p
            style={{
              fontSize: size,
              fontWeight: weight === "light" ? 300 : 700,
              margin: 0,
            }}
          >
            {title}
          </p>
        ),
      }}
    />
  );
}

export function Example4() {
  return (
    <ConfigPreview
      label="Non-collapsible field group"
      componentConfig={{
        fields: {
          title: { type: "text" },
          weight: {
            type: "radio",
            options: [
              { label: "Light", value: "light" },
              { label: "Bold", value: "bold" },
            ],
          },
          size: { type: "number", min: 16, max: 64 },
        },
        renderFields: ({ fields }) => (
          <>
            {fields.title}
            <FieldGroup label="Appearance" collapsible={false}>
              {fields.weight}
              {fields.size}
            </FieldGroup>
          </>
        ),
        defaultProps: {
          title: "Hello, world",
          weight: "light",
          size: 24,
        },
        render: ({ title, weight, size }) => (
          <p
            style={{
              fontSize: size,
              fontWeight: weight === "light" ? 300 : 700,
              margin: 0,
            }}
          >
            {title}
          </p>
        ),
      }}
    />
  );
}

export function Example5() {
  return (
    <ConfigPreview
      label="Field tabs"
      componentConfig={{
        fields: {
          title: { type: "text" },
          weight: {
            type: "radio",
            options: [
              { label: "Light", value: "light" },
              { label: "Bold", value: "bold" },
            ],
          },
          size: { type: "number", min: 16, max: 64 },
        },
        renderFields: ({ fields }) => (
          <>
            <FieldTab label="Content">{fields.title}</FieldTab>
            <FieldTab label="Appearance">
              {fields.weight}
              {fields.size}
            </FieldTab>
          </>
        ),
        defaultProps: {
          title: "Hello, world",
          weight: "light",
          size: 24,
        },
        render: ({ title, weight, size }) => (
          <p
            style={{
              fontSize: size,
              fontWeight: weight === "light" ? 300 : 700,
              margin: 0,
            }}
          >
            {title}
          </p>
        ),
      }}
    />
  );
}

export function Example6() {
  return (
    <ConfigPreview
      label="Field tabs and groups"
      componentConfig={{
        fields: {
          title: { type: "text" },
          weight: {
            type: "radio",
            options: [
              { label: "Light", value: "light" },
              { label: "Bold", value: "bold" },
            ],
          },
          size: { type: "number", min: 16, max: 64 },
        },
        renderFields: ({ fields }) => (
          <>
            <FieldTab label="Content">{fields.title}</FieldTab>
            <FieldTab label="Appearance">
              <FieldGroup label="Typography" id="tabs-fieldgroup-typography">
                {fields.weight}
                {fields.size}
              </FieldGroup>
            </FieldTab>
          </>
        ),
        defaultProps: {
          title: "Hello, world",
          weight: "light",
          size: 24,
        },
        render: ({ title, weight, size }) => (
          <p
            style={{
              fontSize: size,
              fontWeight: weight === "light" ? 300 : 700,
              margin: 0,
            }}
          >
            {title}
          </p>
        ),
      }}
    />
  );
}
