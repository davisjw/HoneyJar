import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { activeFileSecrets } from "./auth-secret.server.ts";
import { deriveFileKey, parseOldSecrets } from "./secret-box.server.ts";
import { openReceipt, sealReceipt } from "./receipt-box.ts";

/** Receipts stay out of the database so opening the books does not read every file. */
export function filesRoot(): string {
  return process.env.HONEYJAR_FILES_DIR || path.join(process.cwd(), "data", "files");
}

/** Current file keys, then each `HONEYJAR_OLD_SECRETS` entry, without duplicates. */
function readSecrets(): string[] {
  const out = [...activeFileSecrets().read];
  for (const old of parseOldSecrets(process.env.HONEYJAR_OLD_SECRETS)) {
    if (!out.includes(old)) out.push(old);
  }
  return out;
}

/** HJF1 bytes for `bytes` under `secret`, or the current file secret when omitted. */
export function encodeHjf1(bytes: Buffer, secret = activeFileSecrets().write): Buffer {
  return sealReceipt(bytes, secret);
}

export function currentReceiptKid(secret = activeFileSecrets().write): number {
  return deriveFileKey(secret).kidByte;
}

export async function writeReceipt(
  userId: string,
  id: string,
  bytes: Buffer,
  root = filesRoot(),
): Promise<void> {
  const { write } = activeFileSecrets();
  const dir = path.join(root, userId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, id), encodeHjf1(bytes, write));
}

export async function readReceipt(userId: string, id: string, root = filesRoot()): Promise<Buffer> {
  const packed = await readFile(path.join(root, userId, id));
  return openReceipt(packed, readSecrets());
}

export async function removeReceipt(userId: string, id: string, root = filesRoot()): Promise<void> {
  await rm(path.join(root, userId, id), { force: true });
}

export async function removeUserFiles(userId: string, root = filesRoot()): Promise<void> {
  await rm(path.join(root, userId), { recursive: true, force: true });
}
