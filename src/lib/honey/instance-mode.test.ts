import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import {
  PRODUCTION_MODE_BANNER,
  isNonLocalAuthUrl,
  resetUnspecifiedProductionWarning,
  shouldShowProductionBanner,
  warnUnspecifiedProduction,
} from "./instance-mode.ts";

const BANNER = "This instance is not in production mode. Set HONEYJAR_ENV=production.";

const saved = {
  HONEYJAR_ENV: process.env.HONEYJAR_ENV,
  GROK_PROJECT_ID: process.env.GROK_PROJECT_ID,
  DATABASE_URL: process.env.DATABASE_URL,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
};

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetUnspecifiedProductionWarning();
});

describe("production mode safety net", () => {
  it("uses the banner sentence exactly", () => {
    assert.equal(PRODUCTION_MODE_BANNER, BANNER);
    const desk = readFileSync(
      new URL("../../components/honey/screens/desk.tsx", import.meta.url),
      "utf8",
    );
    assert.match(desk, /isOwner && data\.instance\.banner/);
    assert.match(desk, /\{PRODUCTION_MODE_BANNER\}/);
    assert.match(desk, /data\.instance\.mode/);
  });

  it("warns only when the env is unset and the instance looks deployed", () => {
    assert.equal(shouldShowProductionBanner({}), false);
    assert.equal(shouldShowProductionBanner({ honeyjarEnv: "   " }), false);
    assert.equal(shouldShowProductionBanner({ grokProjectId: "proj" }), true);
    assert.equal(
      shouldShowProductionBanner({
        databaseUrl: "postgres://honeyjar@db/honeyjar",
        betterAuthUrl: "https://books.example.com",
      }),
      true,
    );
    assert.equal(
      shouldShowProductionBanner({
        databaseUrl: "postgres://honeyjar@db/honeyjar",
        betterAuthUrl: "http://localhost:8080",
      }),
      false,
    );
    assert.equal(
      shouldShowProductionBanner({
        databaseUrl: "postgres://honeyjar@db/honeyjar",
        betterAuthUrl: "http://127.0.0.1:8080",
      }),
      false,
    );
    assert.equal(
      shouldShowProductionBanner({
        databaseUrl: "postgres://honeyjar@db/honeyjar",
        betterAuthUrl: "http://[::1]:8080",
      }),
      false,
    );
    assert.equal(
      shouldShowProductionBanner({
        databaseUrl: "postgres://honeyjar@db/honeyjar",
        betterAuthUrl: "http://app.localhost",
      }),
      false,
    );
    assert.equal(
      shouldShowProductionBanner({ databaseUrl: "postgres://honeyjar@db/honeyjar" }),
      false,
    );
    assert.equal(shouldShowProductionBanner({ betterAuthUrl: "https://books.example.com" }), false);
    assert.equal(
      shouldShowProductionBanner({
        honeyjarEnv: "development",
        grokProjectId: "proj",
      }),
      false,
    );
    assert.equal(
      shouldShowProductionBanner({ honeyjarEnv: "preview", grokProjectId: "proj" }),
      false,
    );
    assert.equal(
      shouldShowProductionBanner({ honeyjarEnv: "production", grokProjectId: "proj" }),
      false,
    );
    assert.equal(
      shouldShowProductionBanner({
        databaseUrl: "postgres://honeyjar@db/honeyjar",
        betterAuthUrl: "not a url",
      }),
      true,
    );
  });

  it("treats loopback names as local", () => {
    assert.equal(isNonLocalAuthUrl("http://localhost:8080"), false);
    assert.equal(isNonLocalAuthUrl("https://books.example.com"), true);
    assert.equal(isNonLocalAuthUrl(undefined), false);
  });

  it("logs the banner once and does not throw", () => {
    delete process.env.HONEYJAR_ENV;
    process.env.GROK_PROJECT_ID = "proj";
    const lines: string[] = [];
    warnUnspecifiedProduction((message) => lines.push(message));
    warnUnspecifiedProduction((message) => lines.push(message));
    assert.deepEqual(lines, [BANNER]);

    resetUnspecifiedProductionWarning();
    process.env.HONEYJAR_ENV = "production";
    const quiet: string[] = [];
    assert.doesNotThrow(() => warnUnspecifiedProduction((message) => quiet.push(message)));
    assert.deepEqual(quiet, []);
  });
});
