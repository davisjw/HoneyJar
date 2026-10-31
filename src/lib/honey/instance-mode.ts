/**
 * Safety net when the operator never chose a mode (HJ-004). Warn only.
 * Production mode itself stays `honeyJarMode()` / `isProductionMode()`.
 *
 * "Looks deployed" means `GROK_PROJECT_ID` is set, or `DATABASE_URL` is set
 * together with a `BETTER_AUTH_URL` that is not local.
 *
 * Local hostnames: `localhost`, anything ending in `.localhost`, `127.0.0.1`,
 * `::1`, and `0.0.0.0`. A value with no scheme is parsed as `http://` plus
 * the value. A value that still is not a URL counts as non-local, so a
 * database plus a broken public URL still warns.
 */
export const PRODUCTION_MODE_BANNER =
  "This instance is not in production mode. Set HONEYJAR_ENV=production.";

export type InstanceModeName = "production" | "development" | "preview";

export type InstanceEnv = {
  honeyjarEnv?: string;
  grokProjectId?: string;
  databaseUrl?: string;
  betterAuthUrl?: string;
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

function filled(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** True when the auth URL is not a loopback or localhost name. */
export function isNonLocalAuthUrl(value: string | undefined): boolean {
  const raw = filled(value);
  if (!raw) return false;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  let hostname: string;
  try {
    hostname = new URL(withScheme).hostname.toLowerCase();
  } catch {
    return true;
  }
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    hostname = hostname.slice(1, -1);
  }
  if (LOCAL_HOSTS.has(hostname) || hostname.endsWith(".localhost")) return false;
  return true;
}

export function looksDeployed(input: InstanceEnv): boolean {
  if (filled(input.grokProjectId)) return true;
  if (filled(input.databaseUrl) && isNonLocalAuthUrl(input.betterAuthUrl)) return true;
  return false;
}

/** Banner and startup warning apply only when `HONEYJAR_ENV` was never set. */
export function shouldShowProductionBanner(input: InstanceEnv): boolean {
  if (filled(input.honeyjarEnv)) return false;
  return looksDeployed(input);
}

let noted = false;

export function resetUnspecifiedProductionWarning(): void {
  noted = false;
}

/** Log the banner sentence once. Does not throw. */
export function warnUnspecifiedProduction(log: (message: string) => void = console.warn): void {
  if (noted) return;
  if (
    !shouldShowProductionBanner({
      honeyjarEnv: process.env.HONEYJAR_ENV,
      grokProjectId: process.env.GROK_PROJECT_ID,
      databaseUrl: process.env.DATABASE_URL,
      betterAuthUrl: process.env.BETTER_AUTH_URL,
    })
  ) {
    return;
  }
  noted = true;
  log(PRODUCTION_MODE_BANNER);
}
