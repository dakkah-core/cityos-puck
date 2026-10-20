import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { smoke } from "./smoke-framework.mjs";
import { dragAndDrop } from "./utils/drag-and-drop.mjs";

export const runs = {
  oneLevel: async (page) => {
    await dragAndDrop(
      page,
      '[data-testid="drawer-item:Heading"]',
      '[data-testid="dropzone:root:default-zone"]'
    );
  },
  twoLevels: async (page) => {
    await dragAndDrop(
      page,
      '[data-testid="drawer-item:Grid"]',
      '[data-testid="dropzone:root:default-zone"]',
      "top"
    );

    await dragAndDrop(
      page,
      '[data-testid="drawer-item:Heading"]',
      '[data-testid="dropzone:root:default-zone"] [data-puck-dropzone]'
    );
  },
  threeLevels: async (page) => {
    await dragAndDrop(
      page,
      '[data-testid="drawer-item:Grid"]',
      '[data-testid="dropzone:root:default-zone"]',
      "top"
    );

    await dragAndDrop(
      page,
      '[data-testid="drawer-item:Grid"]',
      '[data-testid="dropzone:root:default-zone"] [data-puck-dropzone]'
    );

    await dragAndDrop(
      page,
      '[data-testid="drawer-item:Heading"]',
      '[data-testid="dropzone:root:default-zone"] [data-puck-dropzone] [data-puck-dropzone]'
    );
  },
  sixLevels: async (page) => {
    await dragAndDrop(
      page,
      '[data-testid="drawer-item:Grid"]',
      '[data-testid="dropzone:root:default-zone"]',
      "top"
    );

    await dragAndDrop(
      page,
      '[data-testid="drawer-item:Grid"]',
      '[data-testid="dropzone:root:default-zone"] [data-puck-dropzone]'
    );

    await dragAndDrop(
      page,
      '[data-testid="drawer-item:Grid"]',
      '[data-testid="dropzone:root:default-zone"] [data-puck-dropzone] [data-puck-dropzone]'
    );

    await dragAndDrop(
      page,
      '[data-testid="drawer-item:Grid"]',
      '[data-testid="dropzone:root:default-zone"] [data-puck-dropzone] [data-puck-dropzone] [data-puck-dropzone]'
    );

    await dragAndDrop(
      page,
      '[data-testid="drawer-item:Grid"]',
      '[data-testid="dropzone:root:default-zone"] [data-puck-dropzone] [data-puck-dropzone] [data-puck-dropzone] [data-puck-dropzone]'
    );

    await dragAndDrop(
      page,
      '[data-testid="drawer-item:Heading"]',
      '[data-testid="dropzone:root:default-zone"] [data-puck-dropzone] [data-puck-dropzone] [data-puck-dropzone] [data-puck-dropzone] [data-puck-dropzone]'
    );
  },
};

export const tests = [
  {
    label: "iframe, 2 levels",
    url: "http://localhost:3000/test/edit?disableIframe=false",
    run: runs.twoLevels,
  },
  {
    label: "iframe, 6 levels",
    url: "http://localhost:3000/test/edit?disableIframe=false",
    run: runs.sixLevels,
  },
  {
    label: "no iframe, 2 levels",
    url: "http://localhost:3000/test/edit?disableIframe=true",
    run: runs.twoLevels,
  },
  {
    label: "no iframe, 6 levels",
    url: "http://localhost:3000/test/edit?disableIframe=true",
    run: runs.sixLevels,
  },
];

export const smokeConfig = {
  chart: true,
  duration: 180,
  threshold: 300,
  browserOptions: { headless: true },
};

export const main = async (args = process.argv.slice(2)) => {
  const { values } = parseArgs({
    args,
    options: { "executable-path": { type: "string" } },
    strict: true,
    allowPositionals: false,
  });

  return smoke(tests, {
    ...smokeConfig,
    browserOptions: {
      ...smokeConfig.browserOptions,
      executablePath: values["executable-path"],
    },
  });
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
