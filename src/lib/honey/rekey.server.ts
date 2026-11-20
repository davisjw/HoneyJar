import { readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { currentReceiptKid, encodeHjf1, filesRoot, readReceipt } from "./files.server.ts";

const TEMP_SUFFIX = ".rekey-tmp";
const MAGIC = Buffer.from("HJF1");

export type RekeyCounts = {
  examined: number;
  rewritten: number;
  unchanged: number;
  failed: number;
};

/**
 * Rewrite legacy and old-kid receipt files as HJF1 under the current secret.
 * Each file is written to a sibling temp name and renamed over the original.
 * A crash before the rename leaves the original in place. Counts only; the
 * log line never includes a path or file name.
 */
export async function rekeyReceipts(options?: {
  root?: string;
  dryRun?: boolean;
  log?: (line: string) => void;
  /** Test hook. Throw after the temp file is written and before rename. */
  beforeRename?: () => void;
}): Promise<RekeyCounts> {
  const root = options?.root ?? filesRoot();
  const dryRun = options?.dryRun === true;
  const log = options?.log ?? ((line: string) => console.log(line));
  const counts: RekeyCounts = { examined: 0, rewritten: 0, unchanged: 0, failed: 0 };
  const kid = currentReceiptKid();
  const files = await listReceipts(root);
  for (const file of files) {
    counts.examined += 1;
    const userId = path.basename(path.dirname(file));
    const id = path.basename(file);
    let packed: Buffer;
    try {
      packed = await readFile(file);
    } catch {
      counts.failed += 1;
      continue;
    }
    let plain: Buffer;
    try {
      plain = await readReceipt(userId, id, root);
    } catch {
      counts.failed += 1;
      continue;
    }
    const already =
      packed.length >= 5 && packed.subarray(0, 4).equals(MAGIC) && packed[4] === kid;
    if (already) {
      counts.unchanged += 1;
      continue;
    }
    counts.rewritten += 1;
    if (dryRun) continue;
    const tmp = `${file}${TEMP_SUFFIX}`;
    await rm(tmp, { force: true });
    await writeFile(tmp, encodeHjf1(plain));
    options?.beforeRename?.();
    await rename(tmp, file);
  }
  const prefix = dryRun ? "files:rekey dry-run" : "files:rekey";
  log(
    `${prefix} examined=${counts.examined} rewritten=${counts.rewritten} unchanged=${counts.unchanged} failed=${counts.failed}`,
  );
  return counts;
}

async function listReceipts(root: string): Promise<string[]> {
  let users;
  try {
    users = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const user of users) {
    if (!user.isDirectory()) continue;
    const dir = path.join(root, user.name);
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile() || entry.name.endsWith(TEMP_SUFFIX)) continue;
      files.push(path.join(dir, entry.name));
    }
  }
  files.sort();
  return files;
}
