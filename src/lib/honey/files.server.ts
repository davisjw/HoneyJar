import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { deriveFileKey, parseOldSecrets } from "./secret-box.server.ts";
import { DEV_AUTH_SECRET, secretForFiles } from "./production-secret.server.ts";

/**
 * Receipt bytes stay in memory. New files are HJF1 (magic, 1-byte kid, iv,
 * tag, ciphertext) under `deriveFileKey`. Legacy files are `iv‖tag‖ciphertext`
 * with `sha256("honeyjar-files:" + secret)`, tried with the current secret
 * and then the development default.
 */

const HJF1 = Buffer.from("HJF1");
const IV_BYTES = 12;
const TAG_BYTES = 16;
const UNREADABLE = "That receipt can't be decrypted with the configured keys";

/** Receipts stay out of the database so opening the books does not read every file. */
export function filesRoot(): string {
  return process.env.HONEYJAR_FILES_DIR || path.join(process.cwd(), "data", "files");
}

function legacyKey(secret: string): Buffer {
  return createHash("sha256").update(`honeyjar-files:${secret}`).digest();
}

/** Current file secret, then each `HONEYJAR_OLD_SECRETS` entry, without duplicates. */
function configuredSecrets(): string[] {
  const current = secretForFiles();
  const out = [current];
  for (const old of parseOldSecrets(process.env.HONEYJAR_OLD_SECRETS)) {
    if (!out.includes(old)) out.push(old);
  }
  return out;
}

function openGcm(key: Buffer, iv: Buffer, tag: Buffer, ct: Buffer): Buffer | null {
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch {
    return null;
  }
}

function seal(key: Buffer, bytes: Buffer): { iv: Buffer; tag: Buffer; ct: Buffer } {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return { iv, tag: cipher.getAuthTag(), ct };
}

export async function writeReceipt(
  userId: string,
  id: string,
  bytes: Buffer,
  root = filesRoot(),
): Promise<void> {
  const { kidByte, key } = deriveFileKey(secretForFiles());
  const { iv, tag, ct } = seal(key, bytes);
  const packed = Buffer.concat([HJF1, Buffer.from([kidByte]), iv, tag, ct]);
  const dir = path.join(root, userId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, id), packed);
}

export async function readReceipt(userId: string, id: string, root = filesRoot()): Promise<Buffer> {
  const packed = await readFile(path.join(root, userId, id));
  const secrets = configuredSecrets();
  const fromNew = packed.subarray(0, HJF1.length).equals(HJF1) ? openHjf1(packed, secrets) : null;
  if (fromNew) return fromNew;
  // A legacy iv can start with the HJF1 bytes. If the new framing does not
  // authenticate, try the old layout before giving up.
  const fromOld = openLegacy(packed, secrets[0] ?? DEV_AUTH_SECRET);
  if (fromOld) return fromOld;
  throw new Error(UNREADABLE);
}

/** Try every configured secret. The kid byte is a hint; GCM auth decides. */
function openHjf1(packed: Buffer, secrets: readonly string[]): Buffer | null {
  if (packed.length < HJF1.length + 1 + IV_BYTES + TAG_BYTES) return null;
  const kid = packed[HJF1.length] ?? 0;
  const iv = packed.subarray(HJF1.length + 1, HJF1.length + 1 + IV_BYTES);
  const tag = packed.subarray(HJF1.length + 1 + IV_BYTES, HJF1.length + 1 + IV_BYTES + TAG_BYTES);
  const ct = packed.subarray(HJF1.length + 1 + IV_BYTES + TAG_BYTES);
  const ordered = [...secrets].sort((a, b) => {
    const aMatch = deriveFileKey(a).kidByte === kid ? 0 : 1;
    const bMatch = deriveFileKey(b).kidByte === kid ? 0 : 1;
    return aMatch - bMatch;
  });
  for (const secret of ordered) {
    const plain = openGcm(deriveFileKey(secret).key, iv, tag, ct);
    if (plain) return plain;
  }
  return null;
}

/** Legacy layout. Current secret first, then the development default. */
function openLegacy(packed: Buffer, current: string): Buffer | null {
  if (packed.length < IV_BYTES + TAG_BYTES) return null;
  const iv = packed.subarray(0, IV_BYTES);
  const tag = packed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ct = packed.subarray(IV_BYTES + TAG_BYTES);
  const secrets = current === DEV_AUTH_SECRET ? [current] : [current, DEV_AUTH_SECRET];
  for (const secret of secrets) {
    const plain = openGcm(legacyKey(secret), iv, tag, ct);
    if (plain) return plain;
  }
  return null;
}

export async function removeReceipt(userId: string, id: string, root = filesRoot()): Promise<void> {
  await rm(path.join(root, userId, id), { force: true });
}

export async function removeUserFiles(userId: string, root = filesRoot()): Promise<void> {
  await rm(path.join(root, userId), { recursive: true, force: true });
}
