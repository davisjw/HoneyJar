import assert from "node:assert/strict";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { deriveFileKey } from "./secret-box.server.ts";
import { readReceipt, writeReceipt } from "./files.server.ts";
import { DEV_AUTH_SECRET } from "./production-secret.server.ts";
import { exportZip } from "./zip.ts";

const VALID = "0123456789abcdef0123456789abcdef";
const OTHER = "fedcba9876543210fedcba9876543210";
const UNREADABLE = "That receipt can't be decrypted with the configured keys";

const saved = {
  secret: process.env.BETTER_AUTH_SECRET,
  old: process.env.HONEYJAR_OLD_SECRETS,
  mode: process.env.HONEYJAR_ENV,
};

afterEach(() => {
  restore("BETTER_AUTH_SECRET", saved.secret);
  restore("HONEYJAR_OLD_SECRETS", saved.old);
  restore("HONEYJAR_ENV", saved.mode);
});

function restore(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function useSecret(secret: string | undefined, old?: string): void {
  if (secret === undefined) delete process.env.BETTER_AUTH_SECRET;
  else process.env.BETTER_AUTH_SECRET = secret;
  if (old === undefined) delete process.env.HONEYJAR_OLD_SECRETS;
  else process.env.HONEYJAR_OLD_SECRETS = old;
  delete process.env.HONEYJAR_ENV;
}

function legacyPacked(secret: string, bytes: Buffer): Buffer {
  const key = createHash("sha256").update(`honeyjar-files:${secret}`).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]);
}

describe("receipt files", () => {
  it("round-trips HJF1 and records the kid of the current secret", async () => {
    useSecret(VALID);
    const root = await mkdtemp(path.join(tmpdir(), "honeyjar-files-"));
    const raw = Buffer.from("receipt-bytes");
    await writeReceipt("user", "doc", raw, root);
    const stored = await readFile(path.join(root, "user", "doc"));
    assert.equal(stored.subarray(0, 4).toString(), "HJF1");
    assert.equal(stored[4], deriveFileKey(VALID).kidByte);
    assert.equal((await readReceipt("user", "doc", root)).toString(), "receipt-bytes");
  });

  it("selects an old kid from HONEYJAR_OLD_SECRETS", async () => {
    useSecret(OTHER);
    const root = await mkdtemp(path.join(tmpdir(), "honeyjar-files-"));
    await writeReceipt("user", "doc", Buffer.from("older"), root);
    const stored = await readFile(path.join(root, "user", "doc"));
    assert.equal(stored[4], deriveFileKey(OTHER).kidByte);
    useSecret(VALID, ` not-it , ${OTHER} `);
    assert.equal((await readReceipt("user", "doc", root)).toString(), "older");
  });

  it("reads a legacy file with the dev key and with a custom key", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "honeyjar-files-"));
    const { writeFile, mkdir } = await import("node:fs/promises");
    await mkdir(path.join(root, "user"), { recursive: true });

    await writeFile(
      path.join(root, "user", "dev"),
      legacyPacked(DEV_AUTH_SECRET, Buffer.from("from-dev")),
    );
    useSecret(VALID);
    assert.equal((await readReceipt("user", "dev", root)).toString(), "from-dev");

    await writeFile(
      path.join(root, "user", "custom"),
      legacyPacked(VALID, Buffer.from("from-custom")),
    );
    assert.equal((await readReceipt("user", "custom", root)).toString(), "from-custom");
  });

  it("says the receipt cannot be decrypted and does not throw a different error", async () => {
    useSecret(OTHER);
    const root = await mkdtemp(path.join(tmpdir(), "honeyjar-files-"));
    await writeReceipt("user", "doc", Buffer.from("nope"), root);
    useSecret(VALID);
    await assert.rejects(readReceipt("user", "doc", root), (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(err.message, UNREADABLE);
      return true;
    });
  });

  it("puts decrypted receipt bytes in the export zip", async () => {
    useSecret(VALID);
    const root = await mkdtemp(path.join(tmpdir(), "honeyjar-files-"));
    await writeReceipt("user", "d1", Buffer.from("scan-bytes"), root);
    const bytes = await readReceipt("user", "d1", root);
    const zip = exportZip({ profile: { displayName: "Calder" } }, [
      { id: "d1", fileName: "scan.pdf", dataBase64: bytes.toString("base64") },
    ]);
    const text = new TextDecoder().decode(zip);
    assert.ok(text.includes("scan-bytes"));
    assert.ok(text.includes("honeyjar.json"));
  });
});
