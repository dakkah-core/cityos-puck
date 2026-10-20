import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// These exercise installed resolver packages in the recorded compatibility lane.
export const installedResolverTests = [
  "react-resolver-stable.test.mjs",
  "resolver-stable.test.mjs",
];

export function sourceTestFiles(files) {
  return files
    .filter((file) => file.endsWith(".test.mjs") && !installedResolverTests.includes(file))
    .sort();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = dirname(fileURLToPath(import.meta.url));
  const files = sourceTestFiles(readdirSync(directory));
  if (files.length === 0) throw new Error("Registration source suite is empty");
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--test", "--test-concurrency=1", ...files.map((file) => resolve(directory, file))],
    { cwd: resolve(directory, "../.."), stdio: "inherit", windowsHide: true },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
