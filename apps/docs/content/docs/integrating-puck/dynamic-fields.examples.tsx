"use client";

import { ConfigPreview } from "@/docs/components/Preview";

export function Example1() {
  return (
<ConfigPreview
  label='Try changing the "drink" field'
  componentConfig={{
    resolveFields: (data) => {
      const fields = {
        drink: {
          type: "radio",
          options: [
            { label: "Water", value: "water" },
            { label: "Orange juice", value: "orange-juice" },
          ],
        },
      };

      if (data.props.drink === "water") {
        return {
          ...fields,
          waterType: {
            type: "radio",
            options: [
              { label: "Still", value: "still" },
              { label: "Sparkling", value: "sparkling" },
            ],
          },
        };
      }

      return fields;
    },
    defaultProps: {
      drink: "water",
      waterType: "still",
    },
    render: ({ drink, waterType }) => (
      <p>
        {drink}
        {drink === "water" ? ` (${waterType})` : ""}
      </p>
    ),

}}
/>
  );
}

export function Example2() {
  return (
<ConfigPreview
  label='Try changing the "category" field'
  componentConfig={{
    resolveFields: async (data, { changed, lastFields }) => {
      if (!changed.category) return lastFields;

      await new Promise((resolve) => setTimeout(resolve, 500));

      return {
        category: {
          type: "radio",
          options: [
            { label: "Fruit", value: "fruit" },
            { label: "Vegetables", value: "vegetables" },
          ],
        },
        item: {
          type: "select",
          options:
            data.props.category === "fruit"
              ? [
                { label: "Select a fruit", value: "" },
                { label: "Apple", value: "apple" },
                { label: "Orange", value: "orange" },
                { label: "Tomato", value: "tomato" }
              ] : [
                { label: "Select a vegetable", value: "" },
                { label: "Broccoli", value: "broccoli" },
                { label: "Cauliflower", value: "cauliflower" },
                { label: "Mushroom", value: "mushroom" },
              ],
        },
      };
    },

    defaultProps: {
      category: "fruit",
      item: "",
    },
    render: ({ item }) => <p>{item}</p>,

}}
/>
  );
}

