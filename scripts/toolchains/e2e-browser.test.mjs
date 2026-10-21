// Real selected Chrome and actual smoke helpers, against a local DOM fixture.
// This checks the browser API boundary; it is not Puck editor/performance proof.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { isAbsolute } from "node:path";
import { test } from "node:test";
import { tests as scenarios } from "../e2e/smoke.mjs";
import { getBox } from "../e2e/utils/get-box.mjs";
import { setup } from "../e2e/utils/setup.mjs";
import { assertNodeVersion, loadToolchain } from "./toolchain.mjs";
import { readDefaultCatalog } from "./catalog-version.mjs";

assertNodeVersion(loadToolchain());
const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
assert.ok(executablePath && isAbsolute(executablePath), "Select an absolute Chrome path through the existing PUPPETEER_EXECUTABLE_PATH input");
const owner = createRequire(import.meta.url);
const installed = JSON.parse(readFileSync(owner.resolve("playwright-core/package.json"), "utf8"));
assert.equal(installed.version, readDefaultCatalog()["playwright-core"]);
const executableSha256 = createHash("sha256").update(readFileSync(executablePath)).digest("hex");

const dropzones = `<div data-testid="dropzone:root:default-zone" data-puck-dropzone>${
  "<div data-puck-dropzone>".repeat(5)
}<span>Local browser contract fixture</span>${"</div>".repeat(5)}</div>`;
const style = `<style>body{margin:0} [data-puck-dropzone]{box-sizing:border-box;padding:12px;min-width:200px;min-height:160px}
[data-testid="dropzone:root:default-zone"]{position:absolute;left:40px;top:40px;width:500px;height:600px}
[data-testid^="drawer-item:"]{position:absolute;left:16px;width:140px;height:40px;background:#ddd}
[data-testid="drawer-item:Heading"]{top:40px}[data-testid="drawer-item:Grid"]{top:100px}</style>`;
const events = `<script>for (const type of ["mousedown","mouseup"]) document.addEventListener(type,event=>{
window.top.__smokeEvents.push({type,x:event.clientX,y:event.clientY,source:event.target.closest('[data-testid^="drawer-item:"]')?.dataset.testid??null});});</script>`;
const server = createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  if (url.pathname === "/frame") {
    response.end(`<!doctype html>${style}${dropzones}${events}`);
    return;
  }
  const framed = url.searchParams.get("disableIframe") !== "true";
  response.end(`<!doctype html>${style}<script>window.__smokeEvents=[];</script>
<div data-testid="drawer-item:Heading">Heading</div><div data-testid="drawer-item:Grid">Grid</div>
${framed ? '<iframe id="preview-frame" src="/frame" style="position:absolute;left:300px;top:120px;width:800px;height:800px;border:0;transform:scale(.5);transform-origin:0 0"></iframe>' : '<section style="position:absolute;left:260px;top:80px">' + dropzones + "</section>"}${events}`);
});

test("selected Chrome executes the four real-helper browser contracts", { timeout: 90_000 }, async (t) => {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const [index, scenario] of scenarios.entries()) {
      await t.test(scenario.label, async () => {
        const url = new URL(scenario.url);
        const { browser, page } = await setup(origin + url.pathname + url.search, { executablePath });
        try {
          const box = await getBox(page, '[data-testid="dropzone:root:default-zone"]');
          assert.deepEqual(box, index < 2
            ? { x: 320, y: 140, width: 250, height: 300 }
            : { x: 300, y: 120, width: 500, height: 600 });
          await scenario.run(page);
          const evidence = await page.evaluate(() => ({
            events: window.__smokeEvents,
            memory: performance.memory?.usedJSHeapSize,
            width: innerWidth,
            height: innerHeight,
            scale: devicePixelRatio,
            userAgent: navigator.userAgent,
          }));
          const depth = index % 2 ? 6 : 2;
          assert.equal(evidence.events.filter(({ type }) => type === "mousedown").length, depth);
          assert.equal(evidence.events.filter(({ type }) => type === "mouseup").length, depth);
          assert.equal(evidence.events.filter(({ type }) => type === "mousedown").at(-1).source, "drawer-item:Heading");
          assert.ok(Number.isFinite(evidence.memory) && evidence.memory > 0);
          assert.deepEqual([evidence.width, evidence.height, evidence.scale], [1200, 812, 1]);
          assert.match(evidence.userAgent, /Chrome\//);
          t.diagnostic(JSON.stringify({ scenario: scenario.label, provider: installed.version,
            browser: browser.version(), executableSha256, memoryBytes: evidence.memory,
            boundary: "real-browser/helper/fixture-only; original editor 180s/300MB smoke remains separate" }));
        } finally {
          await browser.close();
        }
      });
    }
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
