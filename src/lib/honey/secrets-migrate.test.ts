import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { Sql } from "../db.ts";
import {
  migrateOpenAiKeys,
  migrateOpenAiKeysOnStartup,
  resetSecretsMigrationForTests,
} from "./secrets-migrate.server.ts";
import { isSecretBoxText, openSecret, sealSecret, secretKeyId } from "./secret-box.server.ts";

const CURRENT = "0123456789abcdef0123456789abcdef";
const OLD = "fedcba9876543210fedcba9876543210";
const KEY = "sk-migrate-secret-value";

const saved = {
  secret: process.env.BETTER_AUTH_SECRET,
  old: process.env.HONEYJAR_OLD_SECRETS,
  mode: process.env.HONEYJAR_ENV,
};

afterEach(() => {
  restore("BETTER_AUTH_SECRET", saved.secret);
  restore("HONEYJAR_OLD_SECRETS", saved.old);
  restore("HONEYJAR_ENV", saved.mode);
  resetSecretsMigrationForTests();
});

function restore(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function memorySql(rows: { user_id: string; openai_key: string }[]): Sql & { updates: number } {
  const state = { updates: 0 };
  const sql = (async () => []) as unknown as Sql & { updates: number };
  sql.updates = 0;
  sql.query = async <T>(text: string, params: unknown[] = []) => {
    if (text.startsWith("select")) {
      return rows.filter((row) => row.openai_key !== "") as T[];
    }
    const [next, userId, previous] = params;
    const row = rows.find((item) => item.user_id === userId && item.openai_key === previous);
    if (!row || typeof next !== "string") return [] as T[];
    row.openai_key = next;
    state.updates += 1;
    sql.updates = state.updates;
    return [{ user_id: userId }] as T[];
  };
  return sql;
}

describe("secrets:migrate", () => {
  it("seals legacy keys, then changes 0 rows when run again", async () => {
    process.env.BETTER_AUTH_SECRET = CURRENT;
    delete process.env.HONEYJAR_OLD_SECRETS;
    delete process.env.HONEYJAR_ENV;
    const rows = [
      { user_id: "a", openai_key: KEY },
      { user_id: "b", openai_key: "sk-other" },
      { user_id: "c", openai_key: "" },
    ];
    const sql = memorySql(rows);
    const lines: string[] = [];
    const first = await migrateOpenAiKeys(sql, { log: (line) => lines.push(line) });
    assert.deepEqual(first, { examined: 2, rewritten: 2, unchanged: 0, failed: 0 });
    assert.equal(lines[0], "secrets:migrate examined=2 rewritten=2 unchanged=0 failed=0");
    assert.equal(lines.join("\n").includes(KEY), false);
    for (const row of rows.slice(0, 2)) {
      assert.equal(isSecretBoxText(row.openai_key), true);
      assert.equal(row.openai_key.startsWith("hjs1:"), true);
    }
    assert.equal(openSecret(rows[0]!.openai_key, "openai-key", { secret: CURRENT, oldSecrets: "" }), KEY);
    const sealed = rows[0]!.openai_key;
    lines.length = 0;
    const second = await migrateOpenAiKeys(sql, { log: (line) => lines.push(line) });
    assert.deepEqual(second, { examined: 2, rewritten: 0, unchanged: 2, failed: 0 });
    assert.equal(rows[0]!.openai_key, sealed);
    assert.equal(sql.updates, 2);
  });

  it("rewraps an envelope from an old secret and leaves a dry run unchanged", async () => {
    const oldEnvelope = sealSecret(KEY, "openai-key", { secret: OLD, oldSecrets: "" });
    process.env.BETTER_AUTH_SECRET = CURRENT;
    process.env.HONEYJAR_OLD_SECRETS = OLD;
    delete process.env.HONEYJAR_ENV;
    const rows = [{ user_id: "a", openai_key: oldEnvelope }];
    const sql = memorySql(rows);
    const preview: string[] = [];
    const dry = await migrateOpenAiKeys(sql, { dryRun: true, log: (line) => preview.push(line) });
    assert.equal(dry.rewritten, 1);
    assert.match(preview[0] ?? "", /^secrets:migrate dry-run /);
    assert.equal(rows[0]!.openai_key, oldEnvelope);
    assert.equal(preview.join("\n").includes(KEY), false);
    await migrateOpenAiKeys(sql, { log: () => {} });
    const stored = rows[0]!.openai_key;
    assert.notEqual(stored, oldEnvelope);
    assert.equal(stored.includes(secretKeyId(CURRENT)), true);
    delete process.env.HONEYJAR_OLD_SECRETS;
    assert.equal(openSecret(stored, "openai-key", { secret: CURRENT, oldSecrets: "" }), KEY);
  });

  it("leaves a key that cannot be opened stored, and does not log it", async () => {
    const stuck = sealSecret(KEY, "openai-key", { secret: OLD, oldSecrets: "" });
    process.env.BETTER_AUTH_SECRET = CURRENT;
    delete process.env.HONEYJAR_OLD_SECRETS;
    delete process.env.HONEYJAR_ENV;
    const rows = [{ user_id: "a", openai_key: stuck }];
    const lines: string[] = [];
    const counts = await migrateOpenAiKeys(memorySql(rows), { log: (line) => lines.push(line) });
    assert.deepEqual(counts, { examined: 1, rewritten: 0, unchanged: 0, failed: 1 });
    assert.equal(rows[0]!.openai_key, stuck);
    assert.equal(lines.join("\n").includes(KEY), false);
    assert.equal(lines.join("\n").includes(stuck), false);
  });

  it("runs at production startup, retries a failure, and does not leak the error", async () => {
    delete process.env.HONEYJAR_ENV;
    let calls = 0;
    await migrateOpenAiKeysOnStartup(async () => {
      calls += 1;
    });
    assert.equal(calls, 0);

    process.env.HONEYJAR_ENV = "production";
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = migrateOpenAiKeysOnStartup(
      () =>
        new Promise<void>((resolve) => {
          calls += 1;
          gate.then(resolve);
        }),
    );
    const second = migrateOpenAiKeysOnStartup(
      () =>
        new Promise<void>((resolve) => {
          calls += 1;
          gate.then(resolve);
        }),
    );
    release();
    await Promise.all([first, second]);
    assert.equal(calls, 1);

    resetSecretsMigrationForTests();
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    try {
      await migrateOpenAiKeysOnStartup(async () => {
        throw new Error(`database blew up ${KEY}`);
      });
    } finally {
      console.warn = original;
    }
    assert.deepEqual(warnings, ["secrets:migrate startup failed"]);
    let retried = 0;
    await migrateOpenAiKeysOnStartup(async () => {
      retried += 1;
    });
    assert.equal(retried, 1);
  });
});
