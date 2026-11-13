import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { activeFileSecrets } from "./auth-secret.server.ts";
import { openReceipt, sealReceipt } from "./receipt-box.ts";

/** Receipts stay out of the database so opening the books does not read every file. */
export function filesRoot(): string {
  return process.env.HONEYJAR_FILES_DIR || path.join(process.cwd(), "data", "files");
}

export async function writeReceipt(userId: string, id: string, bytes: Buffer, root = filesRoot()): Promise<void> {
  const { write } = activeFileSecrets();
  const dir = path.join(root, userId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, id), sealReceipt(bytes, write));
}

export async function readReceipt(userId: string, id: string, root = filesRoot()): Promise<Buffer> {
  const packed = await readFile(path.join(root, userId, id));
  return openReceipt(packed, activeFileSecrets().read);
}

export async function removeReceipt(userId: string, id: string, root = filesRoot()): Promise<void> {
  await rm(path.join(root, userId, id), { force: true });
}

export async function removeUserFiles(userId: string, root = filesRoot()): Promise<void> {
  await rm(path.join(root, userId), { recursive: true, force: true });
}
