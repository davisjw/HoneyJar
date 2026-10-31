import { parseCsv } from "../calc.ts";
import type { StatementParser } from "./types.ts";

/**
 * CSV is the fallback, not a format we can recognize. `detect` is always
 * false so a signed format (OFX, later QIF) wins when it matches. The
 * registry calls `parse` only after every other adapter has declined.
 */
export const csvStatementParser: StatementParser = {
  id: "csv",
  externalSource: "",
  extensions: [".csv"],
  label: "CSV",
  detect() {
    return false;
  },
  parse(text) {
    return parseCsv(text);
  },
};
