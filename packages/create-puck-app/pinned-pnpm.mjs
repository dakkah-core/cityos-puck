import { closeSync, existsSync, openSync, readSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, posix, win32 } from "node:path";
import { spawnSync } from "node:child_process";

// pnpm 12 is native. Never execute a .cmd, shell placeholder or Corepack wrapper
// whose embedded runtime or first-use download would escape this boundary.
export function isNativeExecutable(path) {
  let descriptor;
  try {
    descriptor = openSync(path, "r");
    const header = Buffer.alloc(4);
    if (readSync(descriptor, header, 0, 4, 0) !== 4) return false;
    return header.subarray(0, 2).toString("hex") === "4d5a" ||
      ["7f454c46", "feedface", "feedfacf", "cefaedfe", "cffaedfe", "cafebabe", "bebafeca", "cafebabf", "bfbafeca"].includes(header.toString("hex"));
  } catch {
    return false;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function pinnedNodeEnvironment(nodeExecutable, environment = process.env, platform = process.platform) {
  const pathKey = Object.keys(environment).find((key) => key.toLowerCase() === "path") ?? "PATH";
  const path = platform === "win32" ? win32 : posix;
  return {
    ...environment,
    [pathKey]: `${path.dirname(nodeExecutable)}${platform === "win32" ? ";" : ":"}${environment[pathKey] ?? ""}`,
    npm_node_execpath: nodeExecutable,
    NODE: nodeExecutable,
  };
}

export function assertPnpmVersion(result, expected) {
  if (result.error || result.status !== 0 || result.stdout?.trim() !== expected) {
    throw new Error(`Expected exactly pnpm ${expected}; installed native manager probe failed or differed (${result.stdout?.trim() ?? result.status}).`);
  }
}

export function pinnedPnpmEnvironment(nodeExecutable, managerExecutable, environment = process.env) {
  if (!["pnpm", "pnpm.exe"].includes(basename(managerExecutable).toLowerCase())) {
    throw new Error("The pinned native manager must retain its pnpm filename for nested tooling");
  }
  const nodeDirectory = dirname(nodeExecutable);
  const managerDirectory = dirname(managerExecutable);
  // Lerna's version command launches pnpm for its lockfile update. A Node
  // directory containing another manager/shim must not shadow the pinned bytes.
  for (const name of ["pnpm", "pnpm.exe", "pnpm.cmd", "pnpm.bat", "pnpm.ps1"]) {
    const candidate = join(nodeDirectory, name);
    if (existsSync(candidate) && realpathSync(candidate) !== realpathSync(managerExecutable)) {
      throw new Error(`A competing manager in the selected Node directory would shadow pinned pnpm: ${candidate}`);
    }
  }
  const env = pinnedNodeEnvironment(nodeExecutable, environment);
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  const separator = process.platform === "win32" ? ";" : ":";
  env[pathKey] = [nodeDirectory, managerDirectory, environment[pathKey]].filter(Boolean).join(separator);
  env.PUCK_PNPM_EXECUTABLE = managerExecutable;
  env.npm_execpath = managerExecutable;
  // pnpm 12 otherwise installs automatically before run/exec when it considers
  // the dependency tree stale. Also replace pnpm's inherited nested-run value.
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'pnpm_config_verify_deps_before_run') delete env[key];
  env.pnpm_config_verify_deps_before_run = 'error';
  // Lerna otherwise routes its internal call through an ambient Corepack.
  delete env.COREPACK_ROOT;
  return env;
}

export function resolvePinnedPnpm({ toolchain, root, environment = process.env, nodeExecutable = process.execPath,
  native = isNativeExecutable, probe = (path, env) => spawnSync(path, ["--version"], { env, encoding: "utf8", windowsHide: true, timeout: 10_000 }),
}) {
  const explicit = environment.PUCK_PNPM_EXECUTABLE;
  if (explicit && !isAbsolute(explicit)) throw new Error("PUCK_PNPM_EXECUTABLE must be an absolute native executable");
  const names = process.platform === "win32" ? ["pnpm.exe", "pnpm"] : ["pnpm"];
  const homes = [
    root && join(root, ".build", "toolchains", "pnpm", toolchain.pnpm),
    root && join(root, "node_modules", "pnpm"),
    environment.PNPM_HOME && join(environment.PNPM_HOME, "bin"),
    environment.PNPM_HOME,
    environment.PNPM_HOME && join(environment.PNPM_HOME, "..", "pnpm"),
    join(dirname(nodeExecutable), "node_modules", "pnpm"),
    join(dirname(nodeExecutable), "..", "lib", "node_modules", "pnpm"),
  ].filter(Boolean);
  const candidates = explicit ? [explicit] : homes.flatMap((home) => names.map((name) => join(home, name)));
  const env = pinnedNodeEnvironment(nodeExecutable, environment);
  for (const candidate of new Set(candidates)) {
    if (!native(candidate)) continue;
    const result = probe(candidate, env);
    if (explicit) assertPnpmVersion(result, toolchain.pnpm);
    if (!result.error && result.status === 0 && result.stdout?.trim() === toolchain.pnpm) {
      return existsSync(candidate) ? realpathSync(candidate) : candidate;
    }
  }
  throw new Error(`No installed native pnpm ${toolchain.pnpm} found. Set PUCK_PNPM_EXECUTABLE to existing exact bytes or provision them under PNPM_HOME. This runner does not install or download a manager.`);
}

export function runPinnedPnpm(args, { toolchain, root, cwd = process.cwd(), environment = process.env } = {}) {
  if (process.versions.node !== toolchain.node) {
    throw new Error(`Expected exactly Node ${toolchain.node}; selected ${process.versions.node}`);
  }
  const executable = resolvePinnedPnpm({ toolchain, root, environment });
  const env = pinnedPnpmEnvironment(process.execPath, executable, environment);
  const result = spawnSync(executable, args, { cwd, env, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`Pinned pnpm terminated by ${result.signal}`);
  return result.status ?? 1;
}
