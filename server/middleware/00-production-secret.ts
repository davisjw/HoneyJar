/**
 * Runs before other Nitro middleware (the `00-` prefix sorts first).
 * In production mode a bad BETTER_AUTH_SECRET answers every request with
 * 500 and never reaches a handler that could sign or encrypt with a fallback.
 */
import { productionSecretHttpResponse } from "../../src/lib/honey/production-secret.server.ts";
import { migrateOpenAiKeysOnStartup } from "../../src/lib/honey/secrets-migrate.server.ts";

export default async function productionSecretMiddleware(
  _event: unknown,
  next: () => unknown,
): Promise<unknown> {
  const blocked = productionSecretHttpResponse();
  if (blocked) return blocked;
  await migrateOpenAiKeysOnStartup();
  return next();
}
