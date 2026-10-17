import { createServerFn } from "@tanstack/react-start";

/** Whether Google, X, and email reset should render. Email and password are separate. */
export const getSignInOptions = createServerFn({ method: "GET" }).handler(async () => {
  const { oauthConfigured } = await import("./server");
  const { smtpConfigured } = await import("../honey/mail");
  return { oauth: oauthConfigured, emailReset: smtpConfigured() };
});

