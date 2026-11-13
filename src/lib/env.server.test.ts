import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  HoneyJarEnvError,
  honeyJarMode,
  isProductionMode,
  isWorkspacePreview,
} from "./env.server.ts";

const TOUCHED = ["HONEYJAR_ENV", "NODE_ENV", "MODE", "GROK_PROJECT_ID"] as const;
const saved = new Map<string, string | undefined>();

function rememberEnv(): void {
  for (const key of TOUCHED) saved.set(key, process.env[key]);
}

function restoreEnv(): void {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function setEnv(patch: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

rememberEnv();
afterEach(restoreEnv);

describe("isProductionMode", () => {
  it("is true only for HONEYJAR_ENV=production, on any host detail", () => {
    setEnv({
      HONEYJAR_ENV: "production",
      NODE_ENV: "development",
      MODE: "development",
      GROK_PROJECT_ID: undefined,
    });
    assert.equal(honeyJarMode(), "production");
    assert.equal(isProductionMode(), true);
    assert.equal(isWorkspacePreview(), true);
  });

  it("treats unset and blank as development", () => {
    for (const value of [undefined, "", "   ", "\n"]) {
      setEnv({ HONEYJAR_ENV: value, NODE_ENV: "production", MODE: "production" });
      assert.equal(honeyJarMode(), "development");
      assert.equal(isProductionMode(), false);
    }
  });

  it("is false for development and preview", () => {
    setEnv({ HONEYJAR_ENV: "development", NODE_ENV: "production", GROK_PROJECT_ID: "proj" });
    assert.equal(honeyJarMode(), "development");
    assert.equal(isProductionMode(), false);

    setEnv({ HONEYJAR_ENV: "preview", NODE_ENV: "production", GROK_PROJECT_ID: "proj" });
    assert.equal(honeyJarMode(), "preview");
    assert.equal(isProductionMode(), false);
  });

  it("ignores NODE_ENV, Vite mode and GROK_PROJECT_ID when HONEYJAR_ENV is unset", () => {
    setEnv({
      HONEYJAR_ENV: undefined,
      NODE_ENV: "production",
      MODE: "production",
      GROK_PROJECT_ID: "proj-live",
    });
    assert.equal(honeyJarMode(), "development");
    assert.equal(isProductionMode(), false);
    assert.equal(isWorkspacePreview(), false);
  });

  it("trims a recognised value", () => {
    setEnv({ HONEYJAR_ENV: "  production  " });
    assert.equal(isProductionMode(), true);
  });

  it("throws HoneyJarEnvError for an unrecognised value and does not return true", () => {
    for (const value of ["prod", "PRODUCTION", "staging"]) {
      setEnv({ HONEYJAR_ENV: value, NODE_ENV: "production" });
      assert.throws(
        () => isProductionMode(),
        (err: unknown) => {
          assert.ok(err instanceof HoneyJarEnvError);
          assert.equal(err.value, value);
          assert.match(err.message, /not a recognised mode/);
          return true;
        },
      );
      assert.throws(() => honeyJarMode(), HoneyJarEnvError);
    }
  });
});
