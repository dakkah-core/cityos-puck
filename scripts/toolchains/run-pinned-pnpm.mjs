import { loadToolchain } from "./toolchain.mjs";
import { runPinnedPnpm } from "../../packages/create-puck-app/pinned-pnpm.mjs";
import { repositoryRoot } from "./toolchain.mjs";

process.exitCode = runPinnedPnpm(process.argv.slice(2), { toolchain: loadToolchain(), root: repositoryRoot });
