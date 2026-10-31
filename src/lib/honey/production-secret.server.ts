import { env, isProductionMode } from "../env.server.ts";
import { warnUnspecifiedProduction } from "./instance-mode.ts";

/**
 * Shared production-mode guard for the auth signing secret and the receipt
 * file key (HJ-003). One decision, two call sites.
 *
 * In production mode (`HONEYJAR_ENV=production` only) a missing, short, or
 * development-default `BETTER_AUTH_SECRET` never falls back. Node exits.
 * A serverless host throws `ProductionSecretError` or, from the request
 * middleware, returns HTTP 500 with the same text. The host (Vercel, Lambda)
 * chooses how the failure is delivered. It does not choose production mode.
 *
 * Outside production mode the historical fallbacks stay, and they still
 * differ: auth keeps a random per-process secret, receipt files keep
 * `honeyjar-dev-secret-change-me`. Both paths log one warning.
 */

export const DEV_AUTH_SECRET = "honeyjar-dev-secret-change-me";
export const MIN_SECRET_BYTES = 32;

export type SecretProblem = "unset" | "dev-default" | "short";

export class ProductionSecretError extends Error {
  readonly code = "production_secret";

  constructor(message: string) {
    super(message);
    this.name = "ProductionSecretError";
  }
}

export type SecretDecision =
  { kind: "ok"; secret: string } | { kind: "fallback" } | { kind: "stop"; message: string };

let warned = false;

/** Tests call this so one case does not swallow the next warning. */
export function resetProductionSecretNotice(): void {
  warned = false;
}

/**
 * Serverless runtimes must return the error on the request. Exiting the
 * process there hides the message behind a platform 502.
 */
export function isServerlessHost(): boolean {
  return Boolean(
    process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.LAMBDA_TASK_ROOT ||
    process.env.FUNCTIONS_WORKER_RUNTIME,
  );
}

export function productionSecretProblem(secret: string | undefined): SecretProblem | null {
  if (!secret) return "unset";
  if (secret === DEV_AUTH_SECRET) return "dev-default";
  if (Buffer.byteLength(secret, "utf8") < MIN_SECRET_BYTES) return "short";
  return null;
}

export function productionSecretMessage(problem: SecretProblem): string {
  const why =
    problem === "unset"
      ? "BETTER_AUTH_SECRET is not set."
      : problem === "dev-default"
        ? "BETTER_AUTH_SECRET is still the public development value honeyjar-dev-secret-change-me."
        : "BETTER_AUTH_SECRET is shorter than 32 bytes.";
  return [
    `HoneyJar is in production mode and will not start. ${why}`,
    "Set BETTER_AUTH_SECRET to a secret only this install knows.",
    "Generate one with: openssl rand -base64 32",
    "Put it in the environment, or in .env next to compose.yaml for Docker.",
    "If this install already had its own secret, keep that same value so sessions and receipt files still decrypt.",
    "See docs/install.md.",
  ].join("\n");
}

function warningMessage(problem: SecretProblem): string {
  const why =
    problem === "unset"
      ? "BETTER_AUTH_SECRET is not set."
      : problem === "dev-default"
        ? "BETTER_AUTH_SECRET is still the public development value honeyjar-dev-secret-change-me."
        : "BETTER_AUTH_SECRET is shorter than 32 bytes.";
  return [
    `HoneyJar is not in production mode. ${why}`,
    "The server is starting with a development fallback. Do not expose that to anyone else.",
    "Generate a real BETTER_AUTH_SECRET with: openssl rand -base64 32",
    "Set HONEYJAR_ENV=production once the secret is in place. See docs/install.md.",
  ].join("\n");
}

function warnOnce(problem: SecretProblem): void {
  if (warned) return;
  warned = true;
  console.warn(warningMessage(problem));
}

/** Classify the current `BETTER_AUTH_SECRET`. Warns once outside production. */
export function readProductionSecret(): SecretDecision {
  const secret = env("BETTER_AUTH_SECRET");
  const problem = productionSecretProblem(secret);
  if (isProductionMode()) {
    if (problem) return { kind: "stop", message: productionSecretMessage(problem) };
    return { kind: "ok", secret: secret as string };
  }
  if (problem) warnOnce(problem);
  if (!secret) return { kind: "fallback" };
  return { kind: "ok", secret };
}

function stopProcess(message: string): never {
  if (isServerlessHost()) throw new ProductionSecretError(message);
  console.error(message);
  process.exit(1);
}

/**
 * Auth signing secret. In production this never calls `previewFallback`.
 * Outside production an unset secret uses that fallback; a set secret is
 * used as-is, including a short or development-default value.
 */
export function secretForAuth(previewFallback: () => string): string {
  const decision = readProductionSecret();
  if (decision.kind === "stop") stopProcess(decision.message);
  if (decision.kind === "fallback") return previewFallback();
  return decision.secret;
}

/**
 * Receipt file secret. Same stop rule as auth. Outside production an unset
 * secret stays the historical public development string.
 */
export function secretForFiles(): string {
  const decision = readProductionSecret();
  if (decision.kind === "stop") stopProcess(decision.message);
  if (decision.kind === "fallback") return DEV_AUTH_SECRET;
  return decision.secret;
}

/**
 * Node startup. Vite calls this from the dev server and from `vite preview`
 * before it listens. A bad production secret exits the process.
 * A serverless host throws instead of exiting.
 */
export function enforceProductionSecret(): void {
  const decision = readProductionSecret();
  if (decision.kind === "stop") stopProcess(decision.message);
  warnUnspecifiedProduction();
}

/**
 * Request gate for the serverless runtime. Production with a bad secret
 * returns 500 and the same text as the Node exit. Otherwise null (continue).
 */
export function productionSecretHttpResponse(): Response | null {
  const decision = readProductionSecret();
  warnUnspecifiedProduction();
  if (decision.kind !== "stop") return null;
  return new Response(decision.message, {
    status: 500,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
