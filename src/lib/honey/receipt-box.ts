import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export function receiptKey(secret: string): Buffer {
  return createHash("sha256").update(`honeyjar-files:${secret}`).digest();
}

export function sealReceipt(bytes: Buffer, secret: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", receiptKey(secret), iv);
  const enc = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}

export function openReceiptWith(packed: Buffer, secret: string): Buffer {
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const enc = packed.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", receiptKey(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]);
}

export function openReceipt(packed: Buffer, secrets: string[]): Buffer {
  let last: unknown;
  for (const secret of secrets) {
    try {
      return openReceiptWith(packed, secret);
    } catch (err) {
      last = err;
    }
  }
  throw last instanceof Error ? last : new Error("Receipt could not be opened.");
}
