import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { nextOpenAiKey, OPENAI_KEY_UNREADABLE, revealOpenAiKey, runOpenAiAdvisor } from "./openai-key.ts";
import { isSecretBoxText, openSecret, sealSecret } from "./secret-box.server.ts";

const SECRET = "0123456789abcdef0123456789abcdef";
const OTHER = "fedcba9876543210fedcba9876543210";
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
    assert.match(source, /openaiKeySet: String\(row\.openai_key \?\? ""\)\.length > 0/);
  });
});

describe("openai key before the advisor call", () => {
  const messages = [{ role: "user", content: "Hello" }];

  function mockFetch(status = 200, body = "Noted.") {
    const calls: { url: string; authorization: string }[] = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      const headers = new Headers(init?.headers);
      calls.push({ url: String(url), authorization: headers.get("authorization") ?? "" });
      return new Response(JSON.stringify({ choices: [{ message: { content: body } }] }), { status });
    };
    return { calls, fetchImpl };
  }

  it("sends the original key for legacy plaintext and for an envelope", async () => {
    process.env.BETTER_AUTH_SECRET = SECRET;
    delete process.env.HONEYJAR_ENV;
    const legacy = mockFetch();
    assert.equal(await runOpenAiAdvisor({
      storedKey: "sk-legacy",
      model: "gpt-4.1-mini",
      messages,
      fetchImpl: legacy.fetchImpl,
    }), "Noted.");
    assert.equal(legacy.calls[0]?.authorization, "Bearer sk-legacy");
    assert.equal(legacy.calls[0]?.url, "https://api.openai.com/v1/chat/completions");

    const envelope = nextOpenAiKey("", "sk-live-original");
    const wrapped = mockFetch();
    await runOpenAiAdvisor({
      storedKey: envelope,
      model: "gpt-4.1-mini",
      messages,
      fetchImpl: wrapped.fetchImpl,
    });
    assert.equal(wrapped.calls[0]?.authorization, "Bearer sk-live-original");
    assert.equal(revealOpenAiKey("sk-legacy"), "sk-legacy");
  });

  it("does not call OpenAI when the envelope cannot be decrypted, and does not leak the key", async () => {
    process.env.BETTER_AUTH_SECRET = OTHER;
    delete process.env.HONEYJAR_OLD_SECRETS;
    delete process.env.HONEYJAR_ENV;
    const envelope = sealSecret("sk-secret-value", "openai-key", { secret: SECRET, oldSecrets: "" });
    const logs: string[] = [];
    const originals = [console.log, console.warn, console.error, console.info];
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));
    console.warn = (...args: unknown[]) => logs.push(args.map(String).join(" "));
    console.error = (...args: unknown[]) => logs.push(args.map(String).join(" "));
    console.info = (...args: unknown[]) => logs.push(args.map(String).join(" "));
    const { calls, fetchImpl } = mockFetch();
    try {
      await assert.rejects(
        () => runOpenAiAdvisor({ storedKey: envelope, model: "gpt-4.1-mini", messages, fetchImpl }),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.equal(err.message, OPENAI_KEY_UNREADABLE);
          assert.equal(err.message.includes("sk-secret-value"), false);
          assert.equal(err.message.includes(envelope), false);
          assert.equal(err.message.includes(SECRET), false);
          return true;
        },
      );
    } finally {
      console.log = originals[0]!;
      console.warn = originals[1]!;
      console.error = originals[2]!;
      console.info = originals[3]!;
    }
    assert.equal(calls.length, 0);
    assert.equal(logs.join("\n").includes("sk-secret-value"), false);
    assert.equal(logs.join("\n").includes(envelope), false);
  });
});
