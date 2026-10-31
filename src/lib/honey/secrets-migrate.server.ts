import type { Sql } from "../db.ts";
import { isProductionMode } from "../env.server.ts";
import { isSecretBoxText, rewrapSecret, sealSecret } from "./secret-box.server.ts";

export type SecretsMigrateCounts = {
  examined: number;
  rewritten: number;
  unchanged: number;
  failed: number;
};

/**
 * Encrypt leftover plaintext `profiles.openai_key` values and re-wrap envelopes
 * that used an older secret. A value that cannot be opened is left as stored
 * so startup does not wipe a key and the advisor can ask for it again.
 * The log line is counts only.
 */
export async function migrateOpenAiKeys(
  sql: Sql,
  options?: { dryRun?: boolean; log?: (line: string) => void },
): Promise<SecretsMigrateCounts> {
  const dryRun = options?.dryRun === true;
  const log = options?.log ?? ((line: string) => console.log(line));
  const counts: SecretsMigrateCounts = { examined: 0, rewritten: 0, unchanged: 0, failed: 0 };
  const rows = await sql.query<{ user_id: string; openai_key: string }>(
    "select user_id, openai_key from profiles where openai_key <> ''",
  );
  for (const row of rows) {
    counts.examined += 1;
    const stored = String(row.openai_key ?? "");
    const next = nextStoredKey(stored);
    if (next === null) {
      counts.failed += 1;
      continue;
    }
    if (next === stored) {
      counts.unchanged += 1;
      continue;
    }
    counts.rewritten += 1;
    if (dryRun) continue;
    const updated = await sql.query<{ user_id: string }>(
      "update profiles set openai_key = $1 where user_id = $2 and openai_key = $3 returning user_id",
      [next, row.user_id, stored],
    );
    if (updated.length === 0) {
      counts.rewritten -= 1;
      counts.unchanged += 1;
    }
  }
  const prefix = dryRun ? "secrets:migrate dry-run" : "secrets:migrate";
  log(
    `${prefix} examined=${counts.examined} rewritten=${counts.rewritten} unchanged=${counts.unchanged} failed=${counts.failed}`,
  );
  return counts;
}

/** Envelope under the current secret, a re-wrapped envelope, or newly sealed plaintext. Null if it cannot be opened. */
function nextStoredKey(stored: string): string | null {
  try {
    if (isSecretBoxText(stored)) return rewrapSecret(stored, "openai-key");
    if (!stored) return stored;
    return sealSecret(stored, "openai-key");
  } catch {
    return null;
  }
}

let started: Promise<void> | null = null;
let finished = false;

export function resetSecretsMigrationForTests(): void {
  started = null;
  finished = false;
}

/**
 * Production startup. Same work as `npm run secrets:migrate`.
 * A failure is logged as a fixed line and does not stop the process: a legacy
 * key still opens, and a key that cannot be decrypted stays stored for the
 * advisor to reject without sending it.
 * Concurrent callers share one attempt. A failed attempt can run again.
 */
export async function migrateOpenAiKeysOnStartup(
  migrate: () => Promise<void> = migrateOpenAiKeysFromDb,
): Promise<void> {
  if (!isProductionMode()) return;
  if (finished) return;
  if (!started) {
    started = (async () => {
      try {
        await migrate();
        finished = true;
      } catch {
        console.warn("secrets:migrate startup failed");
        started = null;
      }
    })();
  }
  await started;
}

async function migrateOpenAiKeysFromDb(): Promise<void> {
  const { getSql } = await import("../db.ts");
  await migrateOpenAiKeys(await getSql());
}
