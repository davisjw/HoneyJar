import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { env } from "../env.server.ts";

/**
 * Secret box (PRD §3). Encrypts a UTF-8 string at rest under a key derived
 * from `BETTER_AUTH_SECRET`. Receipt bytes do not use this text envelope;
 * HJ-005 (HJF1) calls `deriveFileKey` and frames the file itself.
 *
 * This module does not read `HONEYJAR_ENV` and does not accept or reject the
 * development default secret. Production-mode secret policy is HJ-003.
 *
 * ## HKDF (v1)
 *
 * `crypto.hkdfSync("sha256", ikm, salt, info, 32)`
 *
 * - IKM: UTF-8 bytes of the master secret (not a pre-hash).
 * - Salt: UTF-8 `honeyjar-secret-box-v1` (fixed, not secret). A labelled salt
 *   keeps these keys distinct from raw HKDF with an empty salt and from the
 *   legacy `sha256("honeyjar-files:" + secret)` receipt key.
 * - Info: UTF-8 `honeyjar-secret-box-v1:` + purpose (`files` or `openai-key`).
 *   Purpose separation is this info string. The same master secret yields
 *   unrelated AES keys per purpose.
 * - Length: 32 bytes, AES-256-GCM.
 *
 * Salt and info share a versioned label so a future envelope version can
 * change both and not collide with v1 keys. AES-GCM also binds
 * `hjs1`, version and purpose as AAD, so a ciphertext cannot be moved across
 * purposes even if a later change forgot the purpose in HKDF info.
 *
 * ## kid
 *
 * Identifies the master secret, not the purpose. One secret has one kid for
 * every purpose, which is what rewrap and HJF1 need.
 *
 * `kid = hex(SHA-256(utf8("honeyjar-kid-v1") || 0x00 || utf8(secret))[0:8])`
 *
 * 16 lowercase hex chars (64 bits). Enough that a handful of rotated secrets
 * will not collide; not a substitute for GCM authentication. The NUL keeps
 * the label from running into the secret.
 *
 * HJF1 stores a single kid byte. `deriveFileKey().kidByte` is the first of
 * those 8 bytes. It is a hint for which configured secret to try. GCM still
 * decides. The text envelope stores the full kid.
 *
 * ## Text envelope
 *
 * `hjs1:` + JSON `{"v":1,"kid":"<hex>","iv":"<b64>","tag":"<b64>","ct":"<b64>"}`
 *
 * `iv` is 12 bytes, `tag` is 16, all three fields are canonical standard
 * base64. The prefix is how a reader tells an envelope from legacy plaintext.
 * `openSecret` does not pass plaintext through; that fallback is HJ-013.
 *
 * ## Old secrets
 *
 * Decrypt and rewrap try the current secret, then each `HONEYJAR_OLD_SECRETS`
 * entry (comma-separated, trimmed, empties dropped). A secret that itself
 * contains a comma cannot be represented. If every key fails GCM auth, the
 * result is `SecretBoxError` with code `secret_decrypt_failed`.
 */

export const SECRET_BOX_PREFIX = "hjs1:";
export const SECRET_BOX_VERSION = 1;

const HKDF_SALT = Buffer.from("honeyjar-secret-box-v1", "utf8");
const HKDF_INFO_PREFIX = "honeyjar-secret-box-v1:";
const KID_LABEL = Buffer.from("honeyjar-kid-v1\0", "utf8");
const IV_BYTES = 12;
const TAG_BYTES = 16;

export const SECRET_PURPOSES = ["files", "openai-key"] as const;
export type SecretPurpose = (typeof SECRET_PURPOSES)[number];

export type SecretBoxErrorCode =
  "secret_missing" | "secret_decrypt_failed" | "secret_malformed" | "secret_purpose";

export class SecretBoxError extends Error {
  readonly code: SecretBoxErrorCode;

  constructor(code: SecretBoxErrorCode, message: string) {
    super(message);
    this.name = "SecretBoxError";
    this.code = code;
  }
}

/** Envelope fields. `iv`, `tag` and `ct` are canonical standard base64. */
export type SecretEnvelope = {
  v: 1;
  kid: string;
  iv: string;
  tag: string;
  ct: string;
};

export type SecretBoxOptions = {
  /**
   * Master secret. When omitted, `BETTER_AUTH_SECRET` is read (trimmed; blank
   * counts as unset). An explicit value is used as given, including the
   * development default. `""` means "no current secret" and does not fall
   * through to the environment.
   */
  secret?: string;
  /**
   * Comma-separated previous master secrets. When omitted,
   * `HONEYJAR_OLD_SECRETS` is read. `""` tries the current secret only.
   */
  oldSecrets?: string;
};

/** True when `value` carries the envelope prefix. Does not validate the body. */
export function isSecretBoxText(value: string): boolean {
  return value.startsWith(SECRET_BOX_PREFIX);
}

/**
 * Split `HONEYJAR_OLD_SECRETS`. Surrounding whitespace is removed and empty
 * entries are dropped. A secret containing a comma cannot be represented.
 */
export function parseOldSecrets(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** 16-char hex kid for a master secret. Stable across purposes. */
export function secretKeyId(secret: string): string {
  return kidDigest(secret).subarray(0, 8).toString("hex");
}

/** First kid byte. HJF1 stores this single byte after the magic. */
export function secretKeyIdByte(secret: string): number {
  return kidDigest(secret)[0] ?? 0;
}

/**
 * 32-byte AES-256 key for `purpose`, derived from `secret`.
 * HJ-005 uses this with `purpose: "files"` (see `deriveFileKey`).
 */
export function derivePurposeKey(secret: string, purpose: SecretPurpose): Buffer {
  if (secret.length === 0) {
    throw new SecretBoxError("secret_missing", "Cannot derive a key from an empty secret.");
  }
  assertPurpose(purpose);
  const key = hkdfSync(
    "sha256",
    Buffer.from(secret, "utf8"),
    HKDF_SALT,
    Buffer.from(`${HKDF_INFO_PREFIX}${purpose}`, "utf8"),
    32,
  );
  return Buffer.from(key);
}

/**
 * Binary key material for the HJF1 receipt format (HJ-005).
 * `key` is the `files` purpose key. `kidByte` is the 1-byte id HJF1 writes
 * after the `HJF1` magic. The byte only hints which secret to try.
 */
export function deriveFileKey(secret: string): { kidByte: number; key: Buffer } {
  return {
    kidByte: secretKeyIdByte(secret),
    key: derivePurposeKey(secret, "files"),
  };
}

/** Encrypt `plaintext` and return the `hjs1:` text envelope. */
export function sealSecret(
  plaintext: string,
  purpose: SecretPurpose,
  options?: SecretBoxOptions,
): string {
  assertPurpose(purpose);
  const secret = requireCurrentSecret(options);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", derivePurposeKey(secret, purpose), iv);
  cipher.setAAD(associatedData(purpose));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return serialize({
    v: SECRET_BOX_VERSION,
    kid: secretKeyId(secret),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ct: ct.toString("base64"),
  });
}

/**
 * Decrypt an `hjs1:` envelope. Tries the current secret, then each old secret.
 * Legacy plaintext is a typed malformed error, not a pass-through.
 */
export function openSecret(
  packed: string,
  purpose: SecretPurpose,
  options?: SecretBoxOptions,
): string {
  assertPurpose(purpose);
  const envelope = parseSecretBox(packed);
  return openWithSecrets(envelope, purpose, candidateSecrets(options));
}

/**
 * Decrypt with the current or an old secret and seal again under the current
 * secret. A value already under the current kid is returned unchanged
 * (same string, not a new IV) after the current key is checked.
 */
export function rewrapSecret(
  packed: string,
  purpose: SecretPurpose,
  options?: SecretBoxOptions,
): string {
  assertPurpose(purpose);
  const current = requireCurrentSecret(options);
  const envelope = parseSecretBox(packed);
  if (envelope.kid === secretKeyId(current)) {
    openWithSecrets(envelope, purpose, [current]);
    return packed;
  }
  const plain = openWithSecrets(envelope, purpose, candidateSecrets(options));
  return sealSecret(plain, purpose, { secret: current });
}

/** Parse and validate an `hjs1:` envelope. Does not decrypt. */
export function parseSecretBox(packed: string): SecretEnvelope {
  if (!isSecretBoxText(packed)) {
    throw new SecretBoxError(
      "secret_malformed",
      "Value is not a secret-box envelope (expected the hjs1: prefix).",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(packed.slice(SECRET_BOX_PREFIX.length));
  } catch {
    throw new SecretBoxError("secret_malformed", "Secret-box envelope is not valid JSON.");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new SecretBoxError("secret_malformed", "Secret-box envelope must be an object.");
  }
  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.join(",") !== "ct,iv,kid,tag,v") {
    throw new SecretBoxError(
      "secret_malformed",
      "Secret-box envelope fields are missing or unexpected.",
    );
  }
  if (record.v !== SECRET_BOX_VERSION) {
    throw new SecretBoxError("secret_malformed", "Unsupported secret-box version.");
  }
  if (typeof record.kid !== "string" || !/^[0-9a-f]{16}$/.test(record.kid)) {
    throw new SecretBoxError("secret_malformed", "Secret-box kid is invalid.");
  }
  if (
    typeof record.iv !== "string" ||
    typeof record.tag !== "string" ||
    typeof record.ct !== "string"
  ) {
    throw new SecretBoxError("secret_malformed", "Secret-box field is not a string.");
  }
  decodeB64(record.iv, IV_BYTES);
  decodeB64(record.tag, TAG_BYTES);
  decodeB64(record.ct);
  return { v: 1, kid: record.kid, iv: record.iv, tag: record.tag, ct: record.ct };
}

function kidDigest(secret: string): Buffer {
  if (secret.length === 0) {
    throw new SecretBoxError("secret_missing", "Cannot derive a key id from an empty secret.");
  }
  return createHash("sha256").update(KID_LABEL).update(Buffer.from(secret, "utf8")).digest();
}

function assertPurpose(purpose: string): asserts purpose is SecretPurpose {
  if (!SECRET_PURPOSES.includes(purpose as SecretPurpose)) {
    const shown = purpose.length > 40 ? `${purpose.slice(0, 40)}…` : purpose;
    throw new SecretBoxError(
      "secret_purpose",
      `Unknown secret-box purpose ${JSON.stringify(shown)}.`,
    );
  }
}

function associatedData(purpose: SecretPurpose): Buffer {
  return Buffer.from(`hjs1\0${SECRET_BOX_VERSION}\0${purpose}`, "utf8");
}

function serialize(envelope: SecretEnvelope): string {
  return (
    SECRET_BOX_PREFIX +
    JSON.stringify({
      v: envelope.v,
      kid: envelope.kid,
      iv: envelope.iv,
      tag: envelope.tag,
      ct: envelope.ct,
    })
  );
}

function decodeB64(value: string, expectedLength?: number): Buffer {
  if (value.length === 0) {
    if (expectedLength !== undefined && expectedLength !== 0) {
      throw new SecretBoxError("secret_malformed", "Secret-box field has an unexpected length.");
    }
    return Buffer.alloc(0);
  }
  if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new SecretBoxError("secret_malformed", "Secret-box field is not canonical base64.");
  }
  const buf = Buffer.from(value, "base64");
  if (buf.toString("base64") !== value) {
    throw new SecretBoxError("secret_malformed", "Secret-box field is not canonical base64.");
  }
  if (expectedLength !== undefined && buf.length !== expectedLength) {
    throw new SecretBoxError("secret_malformed", "Secret-box field has an unexpected length.");
  }
  return buf;
}

function currentSecret(options?: SecretBoxOptions): string | undefined {
  if (options && "secret" in options) {
    if (options.secret === undefined) return env("BETTER_AUTH_SECRET");
    return options.secret.length > 0 ? options.secret : undefined;
  }
  return env("BETTER_AUTH_SECRET");
}

function requireCurrentSecret(options?: SecretBoxOptions): string {
  const secret = currentSecret(options);
  if (!secret) {
    throw new SecretBoxError("secret_missing", "BETTER_AUTH_SECRET is not set.");
  }
  return secret;
}

function candidateSecrets(options?: SecretBoxOptions): string[] {
  const current = currentSecret(options);
  const raw =
    options && "oldSecrets" in options && options.oldSecrets !== undefined
      ? options.oldSecrets
      : process.env.HONEYJAR_OLD_SECRETS;
  const out: string[] = [];
  if (current) out.push(current);
  for (const old of parseOldSecrets(raw)) {
    if (!out.includes(old)) out.push(old);
  }
  return out;
}

function openWithSecrets(
  envelope: SecretEnvelope,
  purpose: SecretPurpose,
  secrets: readonly string[],
): string {
  if (secrets.length === 0) {
    throw new SecretBoxError(
      "secret_missing",
      "No secret is configured to decrypt this value. Set BETTER_AUTH_SECRET or HONEYJAR_OLD_SECRETS.",
    );
  }
  const iv = decodeB64(envelope.iv, IV_BYTES);
  const tag = decodeB64(envelope.tag, TAG_BYTES);
  const ct = decodeB64(envelope.ct);
  for (const secret of secrets) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", derivePurposeKey(secret, purpose), iv);
      decipher.setAAD(associatedData(purpose));
      decipher.setAuthTag(tag);
      const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
      return plain.toString("utf8");
    } catch (err) {
      if (err instanceof SecretBoxError) throw err;
      // Wrong key or tampered ciphertext. Try the next configured secret.
    }
  }
  throw new SecretBoxError(
    "secret_decrypt_failed",
    "Ciphertext could not be decrypted with the current secret or any HONEYJAR_OLD_SECRETS entry.",
  );
}
