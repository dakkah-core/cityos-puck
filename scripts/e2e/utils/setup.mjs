import { isAbsolute } from "node:path";
import { chromium } from "playwright-core";

export const setup = async (
  url = "http://localhost:3000/test/edit?disableIframe=false",
  {
    headless = true,
    executablePath = process.env.PUPPETEER_EXECUTABLE_PATH,
    ...unsupportedOptions
  } = {}
) => {
  if (Object.keys(unsupportedOptions).length) {
    throw new Error(
      "Smoke browser options support only headless and executablePath; Chromium CDP is selected explicitly."
    );
  }

  if (
    typeof executablePath !== "string" ||
    !executablePath.trim() ||
    !isAbsolute(executablePath)
  ) {
    throw new Error(
      'Select an absolute Chrome executable path: node scripts/toolchains/run-pinned-pnpm.mjs smoke --executable-path "/absolute/path/to/chrome". Programmatic callers may pass executablePath; the existing PUPPETEER_EXECUTABLE_PATH input is also accepted. No browser is downloaded or selected automatically.'
    );
  }

  const browser = await chromium.launch({ headless, executablePath });

  try {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 812 },
      deviceScaleFactor: 1,
      colorScheme: null,
      contrast: null,
      forcedColors: null,
      reducedMotion: null,
    });
    await page.goto(url, { waitUntil: "load", timeout: 30_000 });

    return { browser, page };
  } catch (error) {
    try {
      await browser.close();
    } catch (closeError) {
      throw new AggregateError(
        [error, closeError],
        "Smoke setup and browser cleanup failed."
      );
    }
    throw error;
  }
};
