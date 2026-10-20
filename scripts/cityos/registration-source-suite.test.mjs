import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { installedResolverTests, sourceTestFiles } from "./registration-source-suite.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const repository = resolve(directory, "../..");

test("Git preserves exact compiler fixture bytes under Windows autocrlf", () => {
  const fixtures = readdirSync(join(directory, "fixtures"))
    .filter((file) => /^compiler-registration.*\.json$/u.test(file))
    .map((file) => `scripts/cityos/fixtures/${file}`);
  assert.ok(fixtures.length >= 4);
  const result = spawnSync("git", ["check-attr", "text", "--", ...fixtures], {
    cwd: repository, encoding: "utf8", windowsHide: true,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split(/\r?\n/u), fixtures.map((file) => `${file}: text: unset`));
});

test("every registration test belongs to the source or installed compatibility lane", () => {
  const files = readdirSync(directory).filter((file) => file.endsWith(".test.mjs")).sort();
  assert.deepEqual([...sourceTestFiles(files), ...installedResolverTests].sort(), files);
  assert.ok(sourceTestFiles(files).includes("registration-source-suite.test.mjs"));
  const workflow = readFileSync(join(repository, ".github/workflows/ci.yml"), "utf8");
  assert.match(workflow, /node scripts\/cityos\/registration-source-suite\.mjs/u);
  assert.doesNotMatch(workflow, /--test scripts\/cityos\/\*\.test\.mjs/u);
  const helper = readFileSync(join(repository, ".github/scripts/run-recorded-check.sh"), "utf8");
  const compatibility = helper.split("\n").find((line) => line.trimStart().startsWith("compatibility)"));
  assert.ok(compatibility?.includes("scripts/toolchains/installed-compatibility.test.mjs"));
  for (const file of installedResolverTests) assert.ok(compatibility.includes(`scripts/cityos/${file}`));
});

for (const passes of [true, false]) {
  test(`source runner needs no installed packages and preserves ${passes ? "success" : "failure"}`, () => {
    const prefix = "puck-registration-source-suite-";
    const root = mkdtempSync(join(tmpdir(), prefix));
    try {
      const fixture = join(root, "scripts/cityos");
      mkdirSync(fixture, { recursive: true });
      copyFileSync(join(directory, "registration-source-suite.mjs"), join(fixture, "registration-source-suite.mjs"));
      writeFileSync(join(fixture, "registration.test.mjs"),
        `import {test} from 'node:test'; test('real source assertion', () => { ${passes ? "" : "throw Error('source failure');"} });\n`);
      for (const file of installedResolverTests) {
        writeFileSync(join(fixture, file), "import 'deliberately-absent-installed-resolver';\n");
      }
      const environment = { ...process.env };
      // The fixture starts an independent Node test process. Inheriting the
      // enclosing test worker marker would make Node silently skip its tests.
      delete environment.NODE_TEST_CONTEXT;
      const result = spawnSync(process.execPath, [join(fixture, "registration-source-suite.mjs")], {
        encoding: "utf8", windowsHide: true, timeout: 30_000, env: environment,
      });
      assert.ifError(result.error);
      assert.equal(result.status, passes ? 0 : 1, result.stdout + result.stderr);
      assert.doesNotMatch(result.stdout + result.stderr, /ERR_MODULE_NOT_FOUND/u);
      assert.match(result.stdout, /real source assertion/u);
      assert.doesNotMatch(result.stdout + result.stderr, /skipping running files/u);
      if (!passes) assert.match(result.stdout, /source failure/u);
    } finally {
      const absolute = resolve(root);
      assert.equal(dirname(absolute), resolve(tmpdir()));
      assert.ok(absolute.startsWith(resolve(tmpdir()) + sep + prefix));
      rmSync(absolute, { recursive: true, force: true });
    }
  });
}
