import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEV_AUTH_SECRET,
  ProductionSecretError,
  enforceProductionSecret,
  isServerlessHost,
  productionSecretHttpResponse,
  productionSecretMessage,
  readProductionSecret,
  resetProductionSecretNotice,
  secretForAuth,
  secretForFiles,
} from "./production-secret.server.ts";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const VALID = "0123456789abcdef0123456789abcdef";
const SHORT = "x".repeat(31);

const TOUCHED = [
  "HONEYJAR_ENV",
  "BETTER_AUTH_SECRET",
  "NODE_ENV",
  "MODE",
  "GROK_PROJECT_ID",
  "VERCEL",
  "AWS_LAMBDA_FUNCTION_NAME",
  "LAMBDA_TASK_ROOT",
  "FUNCTIONS_WORKER_RUNTIME",
] as const;

const saved = new Map<string, string | undefined>();
for (const key of TOUCHED) saved.set(key, process.env[key]);

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetProductionSecretNotice();
});

function setEnv(patch: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetProductionSecretNotice();
}

function assertActionable(text: string): void {
  assert.match(text, /BETTER_AUTH_SECRET/);
  assert.match(text, /openssl rand -base64 32/);
  assert.match(text, /docs\/install\.md/);
}

function childEnv(patch: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of [
    "VERCEL",
    "AWS_LAMBDA_FUNCTION_NAME",
    "LAMBDA_TASK_ROOT",
    "FUNCTIONS_WORKER_RUNTIME",
  ]) {
    delete env[key];
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return env;
}

function runNode(
  patch: Record<string, string | undefined>,
): Promise<{ code: number | null; stdout: string; stderr: string; elapsed: number }> {
  const started = Date.now();
  const child = spawn(
    process.execPath,
    [
      "--experimental-strip-types",
      "--input-type=module",
      "-e",
      [
        'import { enforceProductionSecret } from "./src/lib/honey/production-secret.server.ts";',
        "enforceProductionSecret();",
        'console.log("SERVED");',
      ].join("\n"),
    ],
    { cwd: ROOT, env: childEnv(patch), stdio: ["ignore", "pipe", "pipe"] },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`production secret check still running after 2s\n${stderr}`));
    }, 2000);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, elapsed: Date.now() - started });
    });
  });
}

describe("production secret guard", () => {
  it("stops production mode when the secret is unset, short, or the dev default", () => {
    const cases: Array<{ secret: string | undefined; reason: RegExp }> = [
      { secret: undefined, reason: /is not set/ },
      { secret: "", reason: /is not set/ },
      { secret: "   ", reason: /is not set/ },
      { secret: SHORT, reason: /shorter than 32 bytes/ },
      { secret: DEV_AUTH_SECRET, reason: /public development value/ },
    ];
    for (const { secret, reason } of cases) {
      setEnv({
        HONEYJAR_ENV: "production",
        BETTER_AUTH_SECRET: secret,
        NODE_ENV: "development",
        GROK_PROJECT_ID: undefined,
        VERCEL: undefined,
      });
      const decision = readProductionSecret();
      assert.equal(decision.kind, "stop");
      if (decision.kind !== "stop") continue;
      assertActionable(decision.message);
      assert.match(decision.message, reason);
    }
  });

  it("accepts a 32-byte secret in production and ignores host env", () => {
    setEnv({
      HONEYJAR_ENV: "production",
      BETTER_AUTH_SECRET: VALID,
      NODE_ENV: "test",
      MODE: "development",
      GROK_PROJECT_ID: undefined,
      VERCEL: "1",
    });
    assert.equal(isServerlessHost(), true);
    const decision = readProductionSecret();
    assert.deepEqual(decision, { kind: "ok", secret: VALID });
    assert.equal(
      secretForAuth(() => "fallback"),
      VALID,
    );
    assert.equal(secretForFiles(), VALID);
  });

  it("keeps the old fallbacks outside production and warns once", () => {
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    try {
      for (const mode of [undefined, "development", "preview"] as const) {
        warnings.length = 0;
        setEnv({
          HONEYJAR_ENV: mode,
          BETTER_AUTH_SECRET: undefined,
          NODE_ENV: "production",
          MODE: "production",
          GROK_PROJECT_ID: "proj-live",
          VERCEL: "1",
        });
        let usedFallback = false;
        const auth = secretForAuth(() => {
          usedFallback = true;
          return "preview-secret";
        });
        const files = secretForFiles();
        assert.equal(usedFallback, true);
        assert.equal(auth, "preview-secret");
        assert.equal(files, DEV_AUTH_SECRET);
        assert.equal(productionSecretHttpResponse(), null);
        assert.equal(warnings.length, 1);
        assert.match(warnings[0] ?? "", /not in production mode/);
        assert.match(warnings[0] ?? "", /openssl rand -base64 32/);
      }
    } finally {
      console.warn = original;
    }
  });

  it("uses a short or dev-default secret outside production, with a warning", () => {
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    try {
      setEnv({ HONEYJAR_ENV: "development", BETTER_AUTH_SECRET: SHORT, VERCEL: undefined });
      assert.equal(secretForFiles(), SHORT);
      assert.equal(
        secretForAuth(() => {
          throw new Error("fallback");
        }),
        SHORT,
      );
      assert.equal(warnings.length, 1);

      warnings.length = 0;
      setEnv({ HONEYJAR_ENV: undefined, BETTER_AUTH_SECRET: DEV_AUTH_SECRET });
      assert.equal(
        secretForAuth(() => "preview"),
        DEV_AUTH_SECRET,
      );
      assert.equal(secretForFiles(), DEV_AUTH_SECRET);
      assert.equal(warnings.length, 1);
    } finally {
      console.warn = original;
    }
  });

  it("returns 500 on a serverless host and does not call the auth fallback", async () => {
    for (const secret of [undefined, SHORT, DEV_AUTH_SECRET]) {
      setEnv({ HONEYJAR_ENV: "production", BETTER_AUTH_SECRET: secret, VERCEL: "1" });
      const response = productionSecretHttpResponse();
      assert.ok(response);
      assert.equal(response.status, 500);
      assert.equal(response.headers.get("content-type"), "text/plain; charset=utf-8");
      const body = await response.text();
      assertActionable(body);
      let fallback = false;
      assert.throws(
        () =>
          secretForAuth(() => {
            fallback = true;
            return "fallback";
          }),
        (err: unknown) => {
          assert.ok(err instanceof ProductionSecretError);
          assert.equal(err.message, body);
          return true;
        },
      );
      assert.equal(fallback, false);
      assert.throws(() => secretForFiles(), ProductionSecretError);
    }
  });

  it("does not 500 a serverless host that is not in production mode", () => {
    setEnv({ HONEYJAR_ENV: undefined, BETTER_AUTH_SECRET: undefined, VERCEL: "1" });
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    try {
      assert.equal(productionSecretHttpResponse(), null);
      assert.equal(secretForFiles(), DEV_AUTH_SECRET);
    } finally {
      console.warn = original;
    }
    assert.equal(warnings.length, 1);
  });

  it("exits non-zero within 2s on Node and still serves outside production", async () => {
    const stopped = await runNode({
      HONEYJAR_ENV: "production",
      BETTER_AUTH_SECRET: undefined,
      NODE_ENV: "production",
      GROK_PROJECT_ID: "proj",
    });
    assert.equal(stopped.code, 1);
    assert.ok(stopped.elapsed < 2000);
    assert.equal(stopped.stdout.includes("SERVED"), false);
    assertActionable(stopped.stderr);

    for (const secret of [SHORT, DEV_AUTH_SECRET]) {
      const result = await runNode({ HONEYJAR_ENV: "production", BETTER_AUTH_SECRET: secret });
      assert.equal(result.code, 1);
      assert.ok(result.elapsed < 2000);
      assert.equal(result.stdout.includes("SERVED"), false);
      assertActionable(result.stderr);
    }

    const served = await runNode({ HONEYJAR_ENV: "production", BETTER_AUTH_SECRET: VALID });
    assert.equal(served.code, 0);
    assert.match(served.stdout, /SERVED/);

    for (const mode of [undefined, "development", "preview"]) {
      const result = await runNode({
        HONEYJAR_ENV: mode,
        BETTER_AUTH_SECRET: undefined,
        NODE_ENV: "production",
      });
      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, /SERVED/);
      assert.match(result.stderr, /not in production mode/);
    }
  });

  it("wires auth and file keys through the same guard", () => {
    const auth = readFileSync(new URL("../auth/server.ts", import.meta.url), "utf8");
    const files = readFileSync(new URL("./files.server.ts", import.meta.url), "utf8");
    const middleware = readFileSync(
      new URL("../../../server/middleware/00-production-secret.ts", import.meta.url),
      "utf8",
    );
    assert.match(auth, /secret:\s*secretForAuth\(previewAuthSecret\)/);
    assert.doesNotMatch(auth, /env\("BETTER_AUTH_SECRET"\)\s*\?\?\s*previewAuthSecret/);
    assert.match(files, /secretForFiles\(\)/);
    assert.doesNotMatch(files, /honeyjar-dev-secret-change-me/);
    assert.match(middleware, /productionSecretHttpResponse/);

    const compose = readFileSync(new URL("../../../compose.yaml", import.meta.url), "utf8");
    assert.match(compose, /HONEYJAR_ENV:\s*\$\{HONEYJAR_ENV:-production\}/);
    assert.match(compose, /BETTER_AUTH_SECRET:\s*\$\{BETTER_AUTH_SECRET:\?/);
    assert.doesNotMatch(compose, /honeyjar-dev-secret-change-me/);
    const example = readFileSync(new URL("../../../.env.example", import.meta.url), "utf8");
    assert.match(example, /^BETTER_AUTH_SECRET=$/m);
    assert.doesNotMatch(example, /^BETTER_AUTH_SECRET=honeyjar-dev-secret-change-me$/m);
  });

  it("documents the same message the process prints", () => {
    assertActionable(productionSecretMessage("unset"));
    assertActionable(productionSecretMessage("short"));
    assertActionable(productionSecretMessage("dev-default"));
    setEnv({ HONEYJAR_ENV: "development", BETTER_AUTH_SECRET: VALID });
    enforceProductionSecret();
  });
});
