import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { deriveFileKey } from "./secret-box.server.ts";

const HJF1 = Buffer.from("HJF1");
const IV_BYTES = 12;
const TAG_BYTES = 16;
const UNREADABLE = "That receipt can't be decrypted with the configured keys";
const DEV_RECEIPT_SECRET = "honeyjar-dev-secret-change-me";

/** Legacy receipt key: sha256("honeyjar-files:" + secret). */
export function receiptKey(secret: string): Buffer {
  return createHash("sha256").update(`honeyjar-files:${secret}`).digest();
}

/** New receipts are HJF1: magic, 1-byte kid, iv, tag, ciphertext. The key is deriveFileKey. */
export function sealReceipt(bytes: Buffer, secret: string): Buffer {
  const { kidByte, key } = deriveFileKey(secret);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([HJF1, Buffer.from([kidByte]), iv, cipher.getAuthTag(), enc]);
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

function openHjf1(packed: Buffer, secrets: readonly string[]): Buffer | null {
  if (packed.length < HJF1.length || !packed.subarray(0, HJF1.length).equals(HJF1)) return null;
  if (packed.length < HJF1.length + 1 + IV_BYTES + TAG_BYTES) return null;
  const kid = packed[HJF1.length] ?? 0;
  const ivStart = HJF1.length + 1;
  const iv = packed.subarray(ivStart, ivStart + IV_BYTES);
  const tag = packed.subarray(ivStart + IV_BYTES, ivStart + IV_BYTES + TAG_BYTES);
  const ct = packed.subarray(ivStart + IV_BYTES + TAG_BYTES);
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

function openLegacy(packed: Buffer, secrets: readonly string[]): Buffer | null {
  if (packed.length < IV_BYTES + TAG_BYTES) return null;
  const iv = packed.subarray(0, IV_BYTES);
  const tag = packed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ct = packed.subarray(IV_BYTES + TAG_BYTES);
  for (const secret of secrets) {
    const plain = openGcm(receiptKey(secret), iv, tag, ct);
    if (plain) return plain;
  }
  return null;
}

export function openReceiptWith(packed: Buffer, secret: string): Buffer {
  const plain =
    (packed.subarray(0, HJF1.length).equals(HJF1) ? openHjf1(packed, [secret]) : null) ??
    openLegacy(packed, [secret]);
  if (!plain) throw new Error(UNREADABLE);
  return plain;
}

export function openReceipt(packed: Buffer, secrets: string[]): Buffer {
  const fromNew = packed.subarray(0, HJF1.length).equals(HJF1) ? openHjf1(packed, secrets) : null;
  if (fromNew) return fromNew;
  const legacySecrets = secrets.includes(DEV_RECEIPT_SECRET)
    ? secrets
    : [...secrets, DEV_RECEIPT_SECRET];
  const fromOld = openLegacy(packed, legacySecrets);
  if (fromOld) return fromOld;
  throw new Error(UNREADABLE);
}
