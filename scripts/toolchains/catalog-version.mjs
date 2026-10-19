import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import bootstrapCatalog from "./read-default-catalog.cjs";

export const { readDefaultCatalog } = bootstrapCatalog;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const name = process.argv[2];
  const version = readDefaultCatalog()[name];
  if (!version) throw new Error(`No catalog version for ${name}`);
  console.log(version);
}
