import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OIDC_PROVIDER_ID, oidcProvider } from "./oidc.ts";

describe("oidcProvider", () => {
  it("stays off unless issuer, client id, and secret are all set", () => {
    assert.equal(oidcProvider({}), null);
    assert.equal(oidcProvider({ OIDC_ISSUER: "https://auth.example/application/o/honeyjar/" }), null);
    assert.equal(
      oidcProvider({
        OIDC_ISSUER: "https://auth.example/application/o/honeyjar",
        OIDC_CLIENT_ID: "honeyjar",
        OIDC_CLIENT_SECRET: "   ",
      }),
      null,
    );
  });

  it("builds a discovery URL and keeps the button label", () => {
    const provider = oidcProvider({
      OIDC_ISSUER: "https://auth.example/application/o/honeyjar/",
      OIDC_CLIENT_ID: "honeyjar",
      OIDC_CLIENT_SECRET: "secret",
      OIDC_LABEL: "Acme",
    });
    assert.ok(provider);
    assert.equal(provider.providerId, OIDC_PROVIDER_ID);
    assert.equal(provider.label, "Acme");
    assert.equal(
      provider.discoveryUrl,
      "https://auth.example/application/o/honeyjar/.well-known/openid-configuration",
    );
    assert.deepEqual(provider.scopes, ["openid", "profile", "email"]);
    assert.equal(provider.pkce, true);
  });

  it("can turn PKCE off for a directory that rejects it", () => {
    const provider = oidcProvider({
      OIDC_ISSUER: "https://auth.example/application/o/honeyjar",
      OIDC_CLIENT_ID: "honeyjar",
      OIDC_CLIENT_SECRET: "secret",
      OIDC_PKCE: "false",
    });
    assert.equal(provider?.pkce, false);
    assert.equal(provider?.label, "OpenID Connect");
  });
});
