// Ambient Node is permitted only for this bootstrap resolver, never repo work.
import { existsSync } from "node:fs";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadToolchain, repositoryRoot } from "./toolchain.mjs";

export function selectExactRuntime(probes, expectedVersion) {
  return probes.find((probe) => probe.status === 0 && probe.version === `v${expectedVersion}`) ?? null;
}

export function resolveWorkspaceNode(toolchain = loadToolchain(), env = process.env) {
  const executable = process.platform === "win32" ? "node.exe" : "node";
  const version = toolchain.node;
  const explicit = env.PUCK_NODE_EXECUTABLE;
  if (explicit && !isAbsolute(explicit)) throw new Error("PUCK_NODE_EXECUTABLE must be absolute");
  const candidates = explicit ? [explicit] : [
    process.execPath,
    join(repositoryRoot, ".build", "toolchains", "node", version, "bin", executable),
    join(repositoryRoot, ".build", "toolchains", "node", version, executable),
    env.NVM_BIN && join(env.NVM_BIN, executable),
    env.NVM_HOME && join(env.NVM_HOME, `v${version}`, executable),
    env.NVM_DIR && join(env.NVM_DIR, "versions", "node", `v${version}`, "bin", executable),
    env.PNPM_HOME && join(env.PNPM_HOME, "nodejs", version, executable),
    ...(env.PATH ?? env.Path ?? "").split(delimiter).filter(Boolean).map((path) => join(path, executable)),
  ];
  for (const candidate of new Set(candidates.filter(Boolean).map((path) => resolve(path)))) {
    if (!existsSync(candidate)) continue;
    const result = spawnSync(candidate, ["--version"], { encoding: "utf8", windowsHide: true, timeout: 10_000 });
    if (selectExactRuntime([{ status: result.status, version: result.stdout?.trim(), executable: candidate }], version)) return candidate;
  }
  throw new Error(`No exact Node ${version} executable found. Install existing runtime bytes or set PUCK_NODE_EXECUTABLE; compatible-major fallbacks are forbidden.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const toolchain = loadToolchain();
  console.log(process.argv.includes("--version") ? `v${toolchain.node}` : resolveWorkspaceNode(toolchain));
}
