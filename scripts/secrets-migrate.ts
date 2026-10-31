import { migrateOpenAiKeys } from "../src/lib/honey/secrets-migrate.server.ts";
import { getSql } from "../src/lib/db.ts";

const dryRun = process.argv.includes("--dry-run");
try {
  const counts = await migrateOpenAiKeys(await getSql(), { dryRun });
  if (counts.failed > 0) process.exitCode = 1;
} catch {
  console.error("secrets:migrate failed");
  process.exitCode = 1;
}
