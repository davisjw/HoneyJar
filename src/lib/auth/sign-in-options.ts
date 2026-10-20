import { createServerFn } from "@tanstack/react-start";

/** Whether Google, X, a company directory, and email reset should render. Email and password are separate. */
export const getSignInOptions = createServerFn({ method: "GET" }).handler(async () => {
  const { oauthConfigured, oidcSignIn } = await import("./server");
  const { smtpConfigured } = await import("../honey/mail");
  return { oauth: oauthConfigured, emailReset: smtpConfigured(), oidc: oidcSignIn };
});

