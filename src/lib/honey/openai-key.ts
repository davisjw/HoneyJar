import { secretForFiles } from "./production-secret.server.ts";
import { isSecretBoxText, openSecret, sealSecret } from "./secret-box.server.ts";

/** Shown when an envelope cannot be opened. Does not include the stored value. */
export const OPENAI_KEY_UNREADABLE =
  "The stored OpenAI key can't be decrypted. Re-enter your OpenAI key in Customize.";

/**
 * Value to store in `profiles.openai_key`.
 * Absent patch: the existing column value, unchanged (no re-encrypt).
 * Present patch: trim and truncate to 300 characters, then an `hjs1:` envelope
 * for purpose `openai-key`. An empty result clears the column.
 * The file-secret helper supplies the master secret, including the dev
 * fallback outside production mode.
 */
export function nextOpenAiKey(stored: string, patch: string | undefined): string {
  if (patch === undefined) return stored;
  const plain = patch.trim().slice(0, 300);
  if (!plain) return "";
  return sealSecret(plain, "openai-key", { secret: secretForFiles(), oldSecrets: "" });
}

/**
 * Key to send as `Authorization: Bearer`. Legacy plaintext passes through.
 * An `hjs1:` envelope is opened for purpose `openai-key`. A failure throws
 * `OPENAI_KEY_UNREADABLE` and does not include the stored value.
 */
export function revealOpenAiKey(stored: string): string {
  if (!stored) return "";
  if (!isSecretBoxText(stored)) return stored;
  try {
    return openSecret(stored, "openai-key");
  } catch {
    throw new Error(OPENAI_KEY_UNREADABLE);
  }
}

type ChatMessage = { role: string; content: string };

/**
 * OpenAI chat call. Decrypts first and does not call `fetch` when that fails
 * or the stored value is empty.
 */
export async function runOpenAiAdvisor(input: {
  storedKey: string;
  model: string;
  messages: ChatMessage[];
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const key = revealOpenAiKey(input.storedKey);
  if (!key) throw new Error("Add an OpenAI API key in Customize, or switch the advisor to Grok.");
  const res = await (input.fetchImpl ?? fetch)("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: input.model,
      messages: input.messages,
      max_tokens: 700,
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    const detail = (await res.text()).split(key).join("[redacted]");
    throw new Error(`The advisor couldn't answer (${res.status}). ${detail.slice(0, 180)}`);
  }
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return body.choices?.[0]?.message?.content?.trim() || "No answer came back.";
}
