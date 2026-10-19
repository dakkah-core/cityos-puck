"use client";

import { ConfigPreview } from "@/docs/components/Preview";

export function Example1() {
  return (
<ConfigPreview
  label="Example"
  componentConfig={{
    fields: {
      data: {
        type: "external",
        fetchList: async () => {
          return [
            { title: "Hello, world", description: "Lorem ipsum 1" },
            { title: "Goodbye, world", description: "Lorem ipsum 2" },
          ];
        },
      },
    },
    render: ({ data }) => {
      return <p style={{ margin: 0 }}>{data?.title || "No data selected"}</p>;
    },
  }}
/>
  );
}

export function Example2() {
  return (
<ConfigPreview
  label="Example"
  componentConfig={{
    fields: {
      data: {
        type: "external",
        fetchList: async ({ filters }) => {
          return [
            { title: "Apple", description: "Lorem ipsum 1", rating: 5 },
            { title: "Orange", description: "Lorem ipsum 2", rating: 3 },
          ].filter((item) =>
            item.rating >= (filters.rating || 0)
          )
        },
        filterFields: {
          rating: {
            type: "number",
          },
        },
      },
    },
    render: ({ data }) => {
      return <p>{data?.title || "No data selected"}</p>;
    },

}}
/>
  );
}

export function Example3() {
  return (
<ConfigPreview
  label="Example"
  componentConfig={{
    fields: {
      data: {
        type: "external",
        fetchList: async () => {
          return [
            { title: "Hello, world", description: "Lorem ipsum 1" },
            { title: "Goodbye, world", description: "Lorem ipsum 2" },
          ];
        },
        getItemSummary: (item) => item.title,
      },
    },
    defaultProps: {
      data: {
        title: "Hello, world",
        description: "Lorem ipsum 1",
      },
    },
    render: ({ data }) => {
      return <p>{data?.title || "No data selected"}</p>;
    },
  }}
/>
  );
}

export function Example4() {
  return (
<ConfigPreview
  label="Example"
  componentConfig={{
    fields: {
      data: {
        type: "external",
        fetchList: async ({ filters }) => {
          return [
            { title: "Apple", description: "Lorem ipsum 1", rating: 5 },
            { title: "Orange", description: "Lorem ipsum 2", rating: 3 },
          ].filter((item) =>
            item.rating >= (filters.rating || 0)
          )
        },
        filterFields: {
          rating: {
            type: "number",
          },
        },
        initialFilters: {
          rating: 1,
        },
      },
    },
    render: ({ data }) => {
      return <p>{data?.title || "No data selected"}</p>;
    },

}}
/>
  );
}

export function Example5() {
  return (
<ConfigPreview
  label="Example"
  componentConfig={{
    fields: {
      data: {
        type: "external",
        fetchList: async ({ query }) => {
          return [
            {
              title: "Apple",
              description:
                "An apple is a round, edible fruit produced by an apple tree.",
            },
            {
              title: "Orange",
              description:
                "An orange is a fruit of various citrus species in the family Rutaceae.",
            },
          ].filter((item) => {
            if (!query) return item;

            const queryLowercase = query.toLowerCase();

            if (item.title.toLowerCase().indexOf(queryLowercase) > -1) {
              return item;
            }

            if (item.description.toLowerCase().indexOf(queryLowercase) > -1) {
              return item;
            }
          })
        },
        showSearch: true,
        initialQuery: 'apple'
      },
    },
    render: ({ data }) => {
      return <p>{data?.title || "No data selected"}</p>;
    },

}}
/>
  );
}

export function Example6() {
  return (
<ConfigPreview
  label="Example"
  componentConfig={{
    fields: {
      data: {
        type: "external",
        fetchList: async () => {
          return [
            { title: "Hello, world", description: "Lorem ipsum 1" },
            { title: "Goodbye, world", description: "Lorem ipsum 2" },
          ];
        },
        mapProp: (item) => item.description,
      },
    },
    render: ({ data }) => {
      return <p>{data || "No data selected"}</p>;
    },
  }}
/>
  );
}

export function Example7() {
  return (
<ConfigPreview
  label="Example"
  componentConfig={{
    fields: {
      data: {
        type: "external",
        fetchList: async () => {
          return [
            { title: "Hello, world", description: "Lorem ipsum 1" },
            { title: "Goodbye, world", description: "Lorem ipsum 2" },
          ];
        },
        mapRow: (item) => ({ ...item, title: item.title.toUpperCase() }),
      },
    },
    render: ({ data }) => {
      return <p>{data?.title || "No data selected"}</p>;
    },
  }}
/>
  );
}

export function Example8() {
  return (
<ConfigPreview
  label="Example"
  componentConfig={{
    fields: {
      data: {
        type: "external",
        fetchList: async () => {
          return [
            {
              title: "Apple",
              description:
                "An apple is a round, edible fruit produced by an apple tree.",
            },
            {
              title: "Orange",
              description:
                "An orange is a fruit of various citrus species in the family Rutaceae.",
            },
          ];
        },
        placeholder: "Pick your favorite fruit",
      },
    },
    render: ({ data }) => {
      return <p>{data?.title || "No data selected"}</p>;
    },
  }}
/>
  );
}

export function Example9() {
  return (
<ConfigPreview
  label="Example"
  componentConfig={{
    fields: {
      data: {
        type: "external",
        fetchList: async () => {
          return [
            { title: "Hello, world", description: "Lorem ipsum 1" },
            { title: "Goodbye, world", description: "Lorem ipsum 2" },
          ];
        },
        renderFooter: ({ items }) => (
          <b>Custom footer with {items.length} results</b>
        ),
      },
    },
    render: ({ data }) => {
      return <p>{data?.title || "No data selected"}</p>;
    },
  }}
/>
  );
}

export function Example10() {
  return (
<ConfigPreview
  label="Example"
  componentConfig={{
    fields: {
      data: {
        type: "external",
        fetchList: async ({ query }) => {
          return [
            {
              title: "Apple",
              description:
                "An apple is a round, edible fruit produced by an apple tree.",
            },
            {
              title: "Orange",
              description:
                "An orange is a fruit of various citrus species in the family Rutaceae.",
            },
          ].filter((item) => {
            if (!query) return item;

            const queryLowercase = query.toLowerCase();

            if (item.title.toLowerCase().indexOf(queryLowercase) > -1) {
              return item;
            }

            if (item.description.toLowerCase().indexOf(queryLowercase) > -1) {
              return item;
            }
          })
        },
        showSearch: true,
      },
    },
    render: ({ data }) => {
      return <p>{data?.title || "No data selected"}</p>;
    },

}}
/>
  );
}

