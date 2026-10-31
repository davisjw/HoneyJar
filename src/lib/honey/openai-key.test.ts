import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { nextOpenAiKey } from "./openai-key.ts";
import { isSecretBoxText, openSecret } from "./secret-box.server.ts";

const SECRET = "0123456789abcdef0123456789abcdef";
const saved = process.env.BETTER_AUTH_SECRET;

afterEach(() => {
  if (saved === undefined) delete process.env.BETTER_AUTH_SECRET;
  else process.env.BETTER_AUTH_SECRET = saved;
});

describe("openai key on write", () => {
  it("stores a new key as an hjs1 envelope after truncating to 300 characters", () => {
    process.env.BETTER_AUTH_SECRET = SECRET;
    delete process.env.HONEYJAR_ENV;
    const long = `sk-${"k".repeat(400)}`;
    const stored = nextOpenAiKey("", long);
    assert.equal(isSecretBoxText(stored), true);
    assert.equal(stored.startsWith("hjs1:"), true);
    const plain = openSecret(stored, "openai-key", { secret: SECRET, oldSecrets: "" });
    assert.equal(plain.length, 300);
    assert.equal(plain, long.trim().slice(0, 300));
  });

  it("leaves an existing envelope byte-identical when the key is absent", () => {
    process.env.BETTER_AUTH_SECRET = SECRET;
    const envelope = nextOpenAiKey("", "sk-live");
    assert.equal(nextOpenAiKey(envelope, undefined), envelope);
    assert.equal(nextOpenAiKey("", undefined), "");
  });

  it("clears a blank key and is what profile.update calls", () => {
    process.env.BETTER_AUTH_SECRET = SECRET;
    assert.equal(nextOpenAiKey("hjs1:keep", "   "), "");
    const source = readFileSync(new URL("./data.server.ts", import.meta.url), "utf8");
    assert.match(source, /nextOpenAiKey\(String\(row\.openai_key \?\? ""\), p\.openaiKey\)/);
  });
});
