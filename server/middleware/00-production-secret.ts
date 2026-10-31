/**
 * Runs before other Nitro middleware (the `00-` prefix sorts first).
 * In production mode a bad BETTER_AUTH_SECRET answers every request with
 * 500 and never reaches a handler that could sign or encrypt with a fallback.
 */
import { productionSecretHttpResponse } from "../../src/lib/honey/production-secret.server.ts";

export default function productionSecretMiddleware(_event: unknown, next: () => unknown): unknown {
  const blocked = productionSecretHttpResponse();
  if (blocked) return blocked;
  return next();
}
