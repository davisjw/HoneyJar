import { secretForFiles } from "./production-secret.server.ts";
import { sealSecret } from "./secret-box.server.ts";

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
