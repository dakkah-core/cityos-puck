import type {
  BaseField,
  ComponentConfigExtensions,
  ComponentMetadata,
  Config,
  FieldMetadata,
  Plugin,
} from "@cityos-core/puck";
import { createAiPlugin, withDynamicConfig } from "@puckeditor/plugin-ai";

// Included by the recipe's TS7 check. These assignments exercise the patched
// module augmentations and public signatures against the owned core types.
const component: ComponentConfigExtensions = { ai: { exclude: true } };
const metadata: ComponentMetadata = { ai: { instructions: "Fixture" } };
const field: BaseField = { ai: { required: true } };
const fieldMetadata: FieldMetadata = { ai: { bind: "title" } };
const plugin: Plugin = createAiPlugin({ scrollTracking: false });
const config: Config = { components: {} };
const resolved: Config = withDynamicConfig(config, {
  root: { props: {} },
  content: [],
});

export const cityosAiTypeContract = {
  component,
  metadata,
  field,
  fieldMetadata,
  plugin,
  resolved,
};
