import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { smoke } from "../e2e/smoke-framework.mjs";
import { main, runs, smokeConfig, tests } from "../e2e/smoke.mjs";
import { setup } from "../e2e/utils/setup.mjs";

// These tests run the real consumer modules. Only browser/terminal/clock I/O is
// faked; they provide no browser, iframe, rendering, or performance proof.
const MB = 1024 * 1024;
const executablePath = resolve("explicit-unit-browser", "chrome");

function existingExecutableInput(t, value) {
  const previous = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (value === undefined) delete process.env.PUPPETEER_EXECUTABLE_PATH;
  else process.env.PUPPETEER_EXECUTABLE_PATH = value;
  t.after(() => {
    if (previous === undefined) delete process.env.PUPPETEER_EXECUTABLE_PATH;
    else process.env.PUPPETEER_EXECUTABLE_PATH = previous;
  });
}

function browserIO(t, { memory = () => 100 * MB, navigationError, geometryError } = {}) {
  const launches = [];
  const browsers = [];
  const pages = [];
  t.mock.method(chromium, "launch", async (options) => {
    launches.push(options);
    const index = pages.length;
    const page = {
      selectors: [],
      mouseCalls: [],
      navigations: [],
      geometryWaits: [],
      disposedGeometryHandles: 0,
      mouse: Object.fromEntries(
        ["move", "down", "up"].map((method) => [
          method,
          async (...args) => page.mouseCalls.push([method, ...args]),
        ])
      ),
      async goto(...args) {
        page.navigations.push(args);
        if (navigationError) throw navigationError;
      },
      async waitForFunction(callback, selector, options) {
        assert.deepEqual(options, { timeout: 30_000 });
        page.geometryWaits.push(selector);
        if (geometryError) throw geometryError;
        const box = await page.evaluate(callback, selector);
        return {
          async jsonValue() { return box; },
          async dispose() { page.disposedGeometryHandles += 1; },
        };
      },
      async evaluate(callback, selector) {
        assert.equal(typeof callback, "function");
        if (selector !== undefined) {
          // An external browser evaluation result, not a substitute getBox().
          page.selectors.push(selector);
          return { x: 10, y: 20, width: 40, height: 20 };
        }
        const previous = Object.getOwnPropertyDescriptor(globalThis, "performance");
        Object.defineProperty(globalThis, "performance", {
          configurable: true,
          value: { memory: { usedJSHeapSize: memory(index) } },
        });
        try {
          return callback();
        } finally {
          if (previous) Object.defineProperty(globalThis, "performance", previous);
          else delete globalThis.performance;
        }
      },
    };
    const browser = {
      closed: 0,
      async newPage(options) {
        page.options = options;
        return page;
      },
      async close() {
        browser.closed += 1;
      },
    };
    pages.push(page);
    browsers.push(browser);
    return browser;
  });
  return { launches, browsers, pages };
}

function terminalAndClockIO(t) {
  const logs = [];
  const writes = [];
  const delays = [];
  t.mock.method(console, "log", (...args) => logs.push(args.join(" ")));
  t.mock.method(console, "error", (...args) => logs.push(args.join(" ")));
  t.mock.method(process.stdout, "write", (value) => {
    writes.push(String(value));
    return true;
  });
  for (const name of ["moveCursor", "clearLine", "cursorTo"]) {
    const previous = Object.getOwnPropertyDescriptor(process.stdout, name);
    Object.defineProperty(process.stdout, name, {
      configurable: true,
      value() {},
    });
    t.after(() => {
      if (previous) Object.defineProperty(process.stdout, name, previous);
      else delete process.stdout[name];
    });
  }
  // Advance only the external clock, leaving the real 180-second source budget.
  let now = 0;
  t.mock.method(Date, "now", () => (now += 180_001));
  t.mock.method(globalThis, "setTimeout", (callback, delay, ...args) => {
    delays.push(delay);
    queueMicrotask(() => callback(...args));
    return {};
  });
  return { logs, writes, delays };
}

test("setup uses explicit Chromium CDP, viewport, system media and return shape", async (t) => {
  existingExecutableInput(t, resolve("another-unit-browser", "chrome"));
  const io = browserIO(t);
  const result = await setup("http://localhost:3000/unit", {
    executablePath,
    headless: true,
  });
  assert.deepEqual(Object.keys(result), ["browser", "page"]);
  assert.equal(result.browser, io.browsers[0]);
  assert.equal(result.page, io.pages[0]);
  assert.deepEqual(io.launches, [{ headless: true, executablePath }]);
  assert.deepEqual(result.page.options, {
    viewport: { width: 1200, height: 812 },
    deviceScaleFactor: 1,
    colorScheme: null,
    contrast: null,
    forcedColors: null,
    reducedMotion: null,
  });
  assert.deepEqual(result.page.navigations, [
    ["http://localhost:3000/unit", { waitUntil: "load", timeout: 30_000 }],
  ]);
});

test("setup accepts the existing explicit executable environment input", async (t) => {
  existingExecutableInput(t, executablePath);
  const io = browserIO(t);
  await setup();
  assert.deepEqual(io.launches, [{ headless: true, executablePath }]);
});

test("missing/relative paths and alternative protocol options cannot launch", async (t) => {
  existingExecutableInput(t, undefined);
  const io = browserIO(t);
  await assert.rejects(setup(), /--executable-path/);
  await assert.rejects(setup(undefined, { executablePath: "relative/chrome" }), /absolute/);
  await assert.rejects(
    setup(undefined, { executablePath, channel: "bidi-chrome" }),
    /only headless and executablePath/
  );
  assert.equal(io.launches.length, 0);
});

test("failed navigation closes the launched browser and rejects", async (t) => {
  const navigationError = new Error("navigation failed");
  const io = browserIO(t, { navigationError });
  await assert.rejects(setup(undefined, { executablePath }), (error) => error === navigationError);
  assert.equal(io.browsers[0].closed, 1);
});

test("the CLI input drives the complete unchanged scenario matrix and metrics", async (t) => {
  const terminal = terminalAndClockIO(t);
  const io = browserIO(t);
  const results = await main(["--executable-path", executablePath]);
  assert.deepEqual(smokeConfig, {
    chart: true,
    duration: 180,
    threshold: 300,
    browserOptions: { headless: true },
  });
  assert.deepEqual(Object.keys(runs), ["oneLevel", "twoLevels", "threeLevels", "sixLevels"]);
  assert.deepEqual(tests.map(({ label }) => label), [
    "iframe, 2 levels", "iframe, 6 levels", "no iframe, 2 levels", "no iframe, 6 levels",
  ]);
  assert.deepEqual(tests.map(({ run }) => run), [
    runs.twoLevels, runs.sixLevels, runs.twoLevels, runs.sixLevels,
  ]);
  assert.equal(results.length, 4);
  const root = '[data-testid="dropzone:root:default-zone"]';
  for (const [index, depth] of [2, 6, 2, 6].entries()) {
    const page = io.pages[index];
    assert.deepEqual(io.launches[index], { headless: true, executablePath });
    assert.equal(page.navigations[0][0], tests[index].url);
    assert.equal(tests[index].url.endsWith(`disableIframe=${index >= 2}`), true);
    assert.equal(page.selectors.length, depth * 2);
    assert.equal(page.geometryWaits.length, depth * 2);
    assert.equal(page.disposedGeometryHandles, depth * 2);
    assert.equal(page.selectors.at(-2), '[data-testid="drawer-item:Heading"]');
    assert.equal(page.selectors.at(-1), root + " [data-puck-dropzone]".repeat(depth - 1));
    assert.equal(page.mouseCalls.filter(([method]) => method === "down").length, depth);
    assert.equal(page.mouseCalls.filter(([method]) => method === "up").length, depth);
    assert.deepEqual(page.mouseCalls.slice(0, 6), [
      ["move", 30, 30], ["down"], ["move", 30, 16],
      ["move", 30, 30], ["move", 30, 16], ["up"],
    ]);
    assert.equal(io.browsers[index].closed, 1);
    assert.deepEqual(results[index].result, {
      memoryUsage: 100 * MB,
      memoryExceeded: false,
      timeElapsedHuman: "360.00",
      memoryData: [50, "100.00"],
      iterations: 1,
    });
  }
  for (const [delay, count] of [[1000, 4], [300, 16], [50, 8], [10, 16], [500, 16]]) {
    assert.equal(terminal.delays.filter((value) => value === delay).length, count);
  }
  assert.ok(terminal.writes.some((value) => value.includes("MB (") && value.includes("iterations")));
  assert.ok(terminal.logs.includes("4/4 tests passed"));
});

test("memory threshold failures reject after all four scenarios, with their metrics", async (t) => {
  terminalAndClockIO(t);
  const io = browserIO(t, { memory: (index) => (index === 0 ? 301 : 300) * MB });
  await assert.rejects(main(["--executable-path", executablePath]), (error) => {
    assert.match(error.message, /1\/4 smoke tests exceeded/);
    assert.equal(error.results.length, 4);
    assert.equal(error.results[0].result.memoryExceeded, true);
    assert.equal(error.results[0].result.memoryUsage, 301 * MB);
    assert.deepEqual(error.results[0].result.memoryData, [50, "301.00"]);
    assert.ok(error.results.slice(1).every(({ result }) => !result.memoryExceeded));
    return true;
  });
  assert.equal(io.browsers.length, 4);
  assert.ok(io.browsers.every((browser) => browser.closed === 1));
});

test("captured output keeps charts and metrics without terminal cursor methods", async (t) => {
  const terminal = terminalAndClockIO(t);
  const io = browserIO(t);
  for (const name of ["moveCursor", "clearLine", "cursorTo"]) {
    Object.defineProperty(process.stdout, name, {
      configurable: true,
      value: undefined,
    });
  }
  const results = await main(["--executable-path", executablePath]);
  assert.equal(results.length, 4);
  assert.ok(results.every(({ result }) => result.iterations === 1));
  assert.ok(terminal.writes.includes("\n"));
  assert.ok(terminal.writes.some((line) => line.includes("MB (") && line.includes("iterations")));
  assert.ok(terminal.logs.includes("4/4 tests passed"));
  assert.ok(io.browsers.every((browser) => browser.closed === 1));
});

test("scenario exceptions reject instead of being counted as passing", async (t) => {
  const terminal = terminalAndClockIO(t);
  const io = browserIO(t);
  const failure = new Error("insertion failed");
  await assert.rejects(
    smoke([{ label: "failed insertion", run: async () => { throw failure; } }], {
      ...smokeConfig,
      browserOptions: { headless: true, executablePath },
    }),
    (error) => error === failure
  );
  assert.equal(io.browsers[0].closed, 1);
  assert.ok(!terminal.logs.some((line) => line.includes("Test successful") || line.includes("tests passed")));
});

test("missing/nonfinite memory samples cannot become successful results", async (t) => {
  terminalAndClockIO(t);
  let sample;
  const io = browserIO(t, { memory: () => sample });
  for (sample of [undefined, NaN, Infinity, -1]) {
    await assert.rejects(main(["--executable-path", executablePath]), /valid usedJSHeapSize/);
  }
  assert.equal(io.browsers.length, 4);
  assert.ok(io.browsers.every((browser) => browser.closed === 1));
});

test("geometry readiness timeout propagates and closes the browser without dragging", async (t) => {
  terminalAndClockIO(t);
  const failure = new Error("visible dropzone readiness timed out");
  const io = browserIO(t, { geometryError: failure });
  await assert.rejects(main(["--executable-path", executablePath]), (error) => error === failure);
  assert.equal(io.pages[0].mouseCalls.length, 0);
  assert.equal(io.browsers[0].closed, 1);
});

test("the real CLI exits nonzero with actionable missing-path guidance", () => {
  const result = spawnSync(process.execPath, ["scripts/e2e/smoke.mjs"], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    env: { ...process.env, PUPPETEER_EXECUTABLE_PATH: "" },
    encoding: "utf8",
    timeout: 15_000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--executable-path/);
});
