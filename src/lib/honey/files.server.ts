import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/** Receipts stay out of the database so opening the books does not read every file. */
export function filesRoot(): string {
  return process.env.HONEYJAR_FILES_DIR || path.join(process.cwd(), "data", "files");
}

function fileKey(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET || "honeyjar-dev-secret-change-me";
  return createHash("sha256").update(`honeyjar-files:${secret}`).digest();
}

export async function writeReceipt(userId: string, id: string, bytes: Buffer, root = filesRoot()): Promise<void> {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", fileKey(), iv);
  const enc = Buffer.concat([cipher.update(bytes), cipher.final()]);
  const packed = Buffer.concat([iv, cipher.getAuthTag(), enc]);
  const dir = path.join(root, userId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, id), packed);
}

export async function readReceipt(userId: string, id: string, root = filesRoot()): Promise<Buffer> {
  const packed = await readFile(path.join(root, userId, id));
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const enc = packed.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", fileKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]);
}

export async function removeReceipt(userId: string, id: string, root = filesRoot()): Promise<void> {
  await rm(path.join(root, userId, id), { force: true });
}

export async function removeUserFiles(userId: string, root = filesRoot()): Promise<void> {
  await rm(path.join(root, userId), { recursive: true, force: true });
}
