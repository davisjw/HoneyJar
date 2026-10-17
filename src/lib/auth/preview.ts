/**
 * Live-preview host allowlist (server-only — NEVER import from the client).
 *
 * The sandbox serves each live preview on a dynamic `https://*.grok-sandbox.com`
 * URL. Better Auth derives that origin from the request and checks it against
 * `PREVIEW_ALLOWED_HOSTS`. There is no OAuth client in this file. Google and X
 * sign-in run only when `GROK_AUTH_CLIENT_ID` and `GROK_AUTH_CLIENT_SECRET`
 * are set in the environment. Email and password do not use them.
 */

/** The shared auth broker issuer (OIDC discovery lives under it). */
export const GROK_ISSUER_DEFAULT = "https://auth.grok.me";

/**
 * Host patterns whose callbacks a configured broker client may use. Better Auth
 * derives the live preview's real origin from the request host and validates it
 * against this list (wildcard-matched).
 */
export const PREVIEW_ALLOWED_HOSTS = ["*.grok-sandbox.com"] as const;
