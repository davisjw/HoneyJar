import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, describe, it } from "node:test";
import {
  SecretBoxError,
  deriveFileKey,
  derivePurposeKey,
  isSecretBoxText,
  openSecret,
  parseOldSecrets,
  parseSecretBox,
  rewrapSecret,
  sealSecret,
  secretKeyId,
  secretKeyIdByte,
} from "./secret-box.server.ts";

const CURRENT = "current-master-secret-0123456789abcdef";
const OLD = "old-master-secret-fedcba9876543210";
const OLDER = "older-master-secret-aaaaaaaaaaaaaaaa";
const DEV = "honeyjar-dev-secret-change-me";

const KEYS = ["BETTER_AUTH_SECRET", "HONEYJAR_OLD_SECRETS"] as const;
const saved = new Map<string, string | undefined>();

function rememberEnv(): void {
  for (const key of KEYS) saved.set(key, process.env[key]);
}

function restoreEnv(): void {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

rememberEnv();
afterEach(restoreEnv);

function boxError(code: SecretBoxError["code"]) {
  return (err: unknown) => {
    assert.ok(err instanceof SecretBoxError);
    assert.equal(err.code, code);
    assert.equal(err.name, "SecretBoxError");
    return true;
  };
}

describe("secret box", () => {
  it("round-trips an envelope under both purposes", () => {
    for (const purpose of ["files", "openai-key"] as const) {
      const plain = purpose === "openai-key" ? "sk-live-café · 123" : "receipt-note";
      const sealed = sealSecret(plain, purpose, { secret: CURRENT, oldSecrets: "" });
      assert.equal(isSecretBoxText(sealed), true);
      assert.equal(sealed.startsWith("hjs1:"), true);
      const envelope = parseSecretBox(sealed);
      assert.equal(envelope.v, 1);
      assert.equal(envelope.kid, secretKeyId(CURRENT));
      assert.deepEqual(Object.keys(JSON.parse(sealed.slice("hjs1:".length))).sort(), [
        "ct",
        "iv",
        "kid",
        "tag",
        "v",
      ]);
      assert.equal(openSecret(sealed, purpose, { secret: CURRENT, oldSecrets: "" }), plain);
    }
  });

  it("uses a fresh iv so two seals of the same plaintext differ", () => {
    const a = sealSecret("same", "files", { secret: CURRENT, oldSecrets: "" });
    const b = sealSecret("same", "files", { secret: CURRENT, oldSecrets: "" });
    assert.notEqual(a, b);
    assert.notEqual(parseSecretBox(a).iv, parseSecretBox(b).iv);
  });

  it("refuses to decrypt an openai-key envelope under the files purpose", () => {
    const sealed = sealSecret("sk-separated", "openai-key", { secret: CURRENT, oldSecrets: "" });
    assert.throws(
      () => openSecret(sealed, "files", { secret: CURRENT, oldSecrets: "" }),
      boxError("secret_decrypt_failed"),
    );
    assert.throws(
      () =>
        openSecret(
          sealSecret("file-bytes", "files", { secret: CURRENT, oldSecrets: "" }),
          "openai-key",
          {
            secret: CURRENT,
            oldSecrets: "",
          },
        ),
      boxError("secret_decrypt_failed"),
    );
  });

  it("decrypts with an old secret when the current secret does not match", () => {
    const sealed = sealSecret("rotated", "openai-key", { secret: OLD, oldSecrets: "" });
    assert.equal(
      openSecret(sealed, "openai-key", { secret: CURRENT, oldSecrets: ` ${OLDER} , ${OLD} ` }),
      "rotated",
    );
    const viaEnv = sealSecret("from-old-env", "files", { secret: OLDER, oldSecrets: "" });
    process.env.BETTER_AUTH_SECRET = CURRENT;
    process.env.HONEYJAR_OLD_SECRETS = `${OLD},${OLDER}`;
    assert.equal(openSecret(viaEnv, "files"), "from-old-env");
  });

  it("raises SecretBoxError when every configured key fails", () => {
    const sealed = sealSecret("nope", "files", { secret: CURRENT, oldSecrets: "" });
    assert.throws(
      () => openSecret(sealed, "files", { secret: "wrong-secret", oldSecrets: `${OLD},${OLDER}` }),
      boxError("secret_decrypt_failed"),
    );
    const envelope = parseSecretBox(sealed);
    const ct = Buffer.from(envelope.ct, "base64");
    ct[0] = (ct[0] ?? 0) ^ 0xff;
    const tampered =
      "hjs1:" +
      JSON.stringify({
        v: envelope.v,
        kid: envelope.kid,
        iv: envelope.iv,
        tag: envelope.tag,
        ct: ct.toString("base64"),
      });
    assert.throws(
      () => openSecret(tampered, "files", { secret: CURRENT, oldSecrets: OLD }),
      boxError("secret_decrypt_failed"),
    );
  });

  it("rejects legacy plaintext instead of passing it through", () => {
    assert.equal(isSecretBoxText("sk-plaintext"), false);
    assert.throws(
      () => openSecret("sk-plaintext", "openai-key", { secret: CURRENT, oldSecrets: "" }),
      boxError("secret_malformed"),
    );
  });

  it("rewraps an old kid under the current secret and leaves a current envelope unchanged", () => {
    const sealed = sealSecret("keep-me", "openai-key", { secret: OLD, oldSecrets: "" });
    const wrapped = rewrapSecret(sealed, "openai-key", { secret: CURRENT, oldSecrets: OLD });
    assert.notEqual(wrapped, sealed);
    assert.equal(parseSecretBox(wrapped).kid, secretKeyId(CURRENT));
    assert.equal(openSecret(wrapped, "openai-key", { secret: CURRENT, oldSecrets: "" }), "keep-me");
    assert.equal(
      rewrapSecret(wrapped, "openai-key", { secret: CURRENT, oldSecrets: OLD }),
      wrapped,
    );
    assert.throws(
      () => rewrapSecret(sealed, "openai-key", { secret: CURRENT, oldSecrets: "" }),
      boxError("secret_decrypt_failed"),
    );
  });

  it("seals and opens with the development default secret", () => {
    const sealed = sealSecret("dev-ok", "files", { secret: DEV, oldSecrets: "" });
    assert.equal(openSecret(sealed, "files", { secret: DEV, oldSecrets: "" }), "dev-ok");
  });

  it("reads BETTER_AUTH_SECRET when no secret is passed", () => {
    process.env.BETTER_AUTH_SECRET = CURRENT;
    delete process.env.HONEYJAR_OLD_SECRETS;
    const sealed = sealSecret("from-env", "openai-key");
    assert.equal(openSecret(sealed, "openai-key"), "from-env");
    assert.equal(parseSecretBox(sealed).kid, secretKeyId(CURRENT));
  });

  it("reports a missing secret with a typed error", () => {
    delete process.env.BETTER_AUTH_SECRET;
    delete process.env.HONEYJAR_OLD_SECRETS;
    assert.throws(() => sealSecret("x", "files", { secret: "" }), boxError("secret_missing"));
    assert.throws(
      () => openSecret("hjs1:{}", "files", { secret: "", oldSecrets: "" }),
      boxError("secret_malformed"),
    );
    const sealed = sealSecret("x", "files", { secret: CURRENT, oldSecrets: "" });
    assert.throws(
      () => openSecret(sealed, "files", { secret: "", oldSecrets: "" }),
      boxError("secret_missing"),
    );
  });

  it("derives a stable per-purpose key and a file-key hint for HJF1", () => {
    const files = derivePurposeKey(CURRENT, "files");
    const again = derivePurposeKey(CURRENT, "files");
    const openai = derivePurposeKey(CURRENT, "openai-key");
    assert.equal(files.length, 32);
    assert.equal(files.equals(again), true);
    assert.equal(files.equals(openai), false);
    const legacy = createHash("sha256").update(`honeyjar-files:${CURRENT}`).digest();
    assert.equal(files.equals(legacy), false);

    const material = deriveFileKey(CURRENT);
    assert.equal(material.key.equals(files), true);
    assert.equal(material.kidByte, secretKeyIdByte(CURRENT));
    assert.equal(material.kidByte, Number.parseInt(secretKeyId(CURRENT).slice(0, 2), 16));
    assert.notEqual(secretKeyId(CURRENT), secretKeyId(OLD));
    assert.equal(secretKeyId(CURRENT), secretKeyId(CURRENT));
  });

  it("parses old secrets without treating commas as part of a secret", () => {
    assert.deepEqual(parseOldSecrets(undefined), []);
    assert.deepEqual(parseOldSecrets(" , a , ,b, "), ["a", "b"]);
  });
});
