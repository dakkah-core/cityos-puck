import { expandNode, flattenNode } from "../flatten-node";
import type { ComponentData, Config } from "../../../types";

describe("flat 6 module integration", () => {
  it("preserves nested properties, empty arrays, and empty objects on round trip", () => {
    const node: ComponentData = {
      type: "Example",
      props: { id: "example", settings: { label: "Nested", empty: {} }, list: [] },
    };
    const config: Config = { components: { Example: { render: () => null } } };
    const flattened = flattenNode(node, config);
    expect(flattened.props["settings.label"]).toBe("Nested");
    expect(expandNode(flattened)).toEqual(node);
  });

  it("strips slots while retaining the parent's ordinary data", () => {
    const node: ComponentData = { type: "Example", props: { id: "example", title: "Parent", slot: [{ type: "Child", props: { id: "child" } }] } };
    const config: Config = { components: { Example: { fields: { slot: { type: "slot" } }, render: () => null } } };
    expect(expandNode(flattenNode(node, config)).props).toEqual({ id: "example", title: "Parent", slot: null });
  });
});
