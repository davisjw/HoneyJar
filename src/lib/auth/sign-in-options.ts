import { createServerFn } from "@tanstack/react-start";

/** Whether Google and X buttons should render. Email and password are separate. */
export const getSignInOptions = createServerFn({ method: "GET" }).handler(async () => {
  const { oauthConfigured } = await import("./server");
  return { oauth: oauthConfigured };
});
