import { rekeyReceipts } from "../src/lib/honey/rekey.server.ts";

const dryRun = process.argv.includes("--dry-run");
const counts = await rekeyReceipts({ dryRun });
if (counts.failed > 0) process.exitCode = 1;
