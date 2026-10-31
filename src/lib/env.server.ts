export function env(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v || undefined;
}

/**
 * Workspace preview vs deployed app. The deployer writes GROK_PROJECT_ID on
 * every publish; the sandbox preview never has it. Single source of truth for
 * the split — gate audience, gate endpoints and connector-token semantics all
 * key off this predicate.
 */
export function isWorkspacePreview(): boolean {
  return !env("GROK_PROJECT_ID");
}

/** Operator-selected mode. Unset or blank `HONEYJAR_ENV` is `development`. */
export type HoneyJarMode = "production" | "development" | "preview";

/**
 * Thrown when `HONEYJAR_ENV` is set to something other than `production`,
 * `development` or `preview`.
 *
 * Unrecognised values are not production and not development. Mapping a typo
 * such as `prod` to production would turn production-only behaviour on
 * without the documented value. Mapping it to development would quietly keep
 * the dev-secret fallbacks — the failure F4a exists to close — and a log line
 * is easy to miss. Failing here leaves no silent interpretation.
 *
 * Comparison is case-sensitive after trim. Blank is the documented default
 * (`development`), not an error.
 */
export class HoneyJarEnvError extends Error {
  /** Trimmed `HONEYJAR_ENV` value that was rejected. */
  readonly value: string;

  constructor(value: string) {
    const shown = value.length > 40 ? `${value.slice(0, 40)}…` : value;
    super(
      `HONEYJAR_ENV=${JSON.stringify(shown)} is not a recognised mode. Use production, development, or preview.`,
    );
    this.name = "HoneyJarEnvError";
    this.value = value;
  }
}

/**
 * The only parser for `HONEYJAR_ENV`. `NODE_ENV`, Vite mode, `GROK_PROJECT_ID`
 * and the host are not read. Workspace preview stays on `isWorkspacePreview()`.
 */
export function honeyJarMode(): HoneyJarMode {
  const value = env("HONEYJAR_ENV");
  if (value === undefined) return "development";
  if (value === "production" || value === "development" || value === "preview") return value;
  throw new HoneyJarEnvError(value);
}

/**
 * Production mode, on any host. True only when `honeyJarMode()` is
 * `production`. This is the only production-mode decision in the app.
 */
export function isProductionMode(): boolean {
  return honeyJarMode() === "production";
}
