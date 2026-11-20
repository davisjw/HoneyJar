/** Provider id and callback path segment: `/api/auth/callback/oidc`. */
export const OIDC_PROVIDER_ID = "oidc";

export type OidcInput = {
  OIDC_ISSUER?: string;
  OIDC_CLIENT_ID?: string;
  OIDC_CLIENT_SECRET?: string;
  OIDC_LABEL?: string;
  OIDC_PKCE?: string;
};

export type OidcProvider = {
  providerId: typeof OIDC_PROVIDER_ID;
  label: string;
  discoveryUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: ["openid", "profile", "email"];
  pkce: boolean;
};

function trim(value: string | undefined): string {
  return value?.trim() ?? "";
}

/**
 * A company's OpenID Connect directory, or null when it is not configured.
 * Missing any of issuer, client id, or secret leaves email/password and the
 * broker buttons untouched.
 */
export function oidcProvider(env: OidcInput): OidcProvider | null {
  const issuer = trim(env.OIDC_ISSUER).replace(/\/+$/, "");
  const clientId = trim(env.OIDC_CLIENT_ID);
  const clientSecret = trim(env.OIDC_CLIENT_SECRET);
  if (!issuer || !clientId || !clientSecret) return null;
  return {
    providerId: OIDC_PROVIDER_ID,
    label: trim(env.OIDC_LABEL) || "OpenID Connect",
    discoveryUrl: `${issuer}/.well-known/openid-configuration`,
    clientId,
    clientSecret,
    scopes: ["openid", "profile", "email"],
    pkce: trim(env.OIDC_PKCE).toLowerCase() !== "false",
  };
}
