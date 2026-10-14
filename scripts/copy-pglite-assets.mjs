#!/usr/bin/env node
/**
 * Nitro inlines @electric-sql/pglite into the server function, but the WASM
 * runtime still loads pglite.data / pglite.wasm / initdb.wasm next to that
 * file via import.meta.url. Copy them beside every bundled copy so the
 * production preview (no DATABASE_URL) can boot PGLite.
 */
import { copyFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "node_modules/@electric-sql/pglite/dist");
const files = ["pglite.data", "pglite.wasm", "initdb.wasm"];
const fnRoot = join(root, ".vercel/output/functions");

function bundledDirs(dir, acc = []) {
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) bundledDirs(path, acc);
    else if (entry.name === "electric-sql__pglite.mjs") acc.push(dirname(path));
  }
  return acc;
}

if (!existsSync(fnRoot)) {
  console.log("[pglite] no function output, skip");
  process.exit(0);
}

const dests = bundledDirs(fnRoot);
if (dests.length === 0) {
  console.warn("[pglite] bundled module not found; production preview may fail to boot");
  process.exit(0);
}

for (const dest of dests) {
  for (const file of files) {
    copyFileSync(join(srcDir, file), join(dest, file));
  }
  console.log(`[pglite] copied data files next to ${dest}`);
}
