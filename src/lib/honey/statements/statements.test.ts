import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCsv, parseOfx, parseStatement } from "../calc.ts";
import { assertStatementParserContract } from "./contract.ts";
import { csvStatementParser } from "./csv.ts";
import { ofxStatementParser } from "./ofx.ts";
import { detectStatementParser, parseRegisteredStatement, statementParsers } from "./registry.ts";

const ofx = `OFXHEADER:100
DATA:OFXSGML
<OFX>
<STMTTRN>
<DTPOSTED>20261001
<TRNAMT>-12.40
<FITID>abc
<NAME>Blue Bottle
<MEMO>coffee
</STMTTRN>
</OFX>`;

const csv = "date,amount,merchant\n2026-10-01,-12.40,Blue Bottle";

describe("statement parser registry", () => {
  it("lists OFX/QFX and CSV, with CSV last as the fallback", () => {
    assert.deepEqual(
      statementParsers().map((parser) => parser.id),
      ["ofx", "csv"],
    );
    assert.equal(statementParsers()[0], ofxStatementParser);
    assert.equal(statementParsers().at(-1), csvStatementParser);
    assert.equal(ofxStatementParser.externalSource, "ofx");
    assert.deepEqual(ofxStatementParser.extensions, [".ofx", ".qfx"]);
    assert.equal(csvStatementParser.externalSource, "");
    assert.equal(csvStatementParser.detect("date,amount\n2026-10-01,-1"), false);
  });

  it("detects OFX and QFX headers and leaves CSV and QIF for the fallback", () => {
    assert.equal(detectStatementParser(ofx), ofxStatementParser);
    assert.equal(detectStatementParser("<ofx></ofx>")?.id, "ofx");
    assert.equal(detectStatementParser(csv), null);
    assert.equal(detectStatementParser("!Type:Bank\nD10/31/2026\nT-12.40\nPBlue Bottle\n^\n"), null);
  });

  it("parseStatement dispatches OFX and falls back to CSV", () => {
    assert.deepEqual(parseStatement(ofx), parseOfx(ofx));
    assert.deepEqual(parseStatement(csv), parseCsv(csv));
    assert.deepEqual(parseRegisteredStatement(csv), parseCsv(csv));
    const qif = "!Type:Bank\nD10/31/2026\nT-12.40\nPBlue Bottle\n^\n";
    assert.deepEqual(parseStatement(qif), parseCsv(qif));
  });

  it("keeps a check number on the row without changing the memo rule", () => {
    const text = `<OFX>
<STMTTRN><DTPOSTED>20261001<TRNAMT>-5.00<CHECKNUM>1042<NAME>Rent</STMTTRN>
<STMTTRN><DTPOSTED>20261002<TRNAMT>-8.00<CHECKNUM>1043</STMTTRN>
</OFX>`;
    const rows = parseOfx(text);
    assert.equal(rows[0]?.checkNumber, "1042");
    assert.equal(rows[0]?.memo, "");
    assert.equal(rows[1]?.checkNumber, "1043");
    assert.equal(rows[1]?.memo, "Check 1043");
    assert.equal(rows[1]?.merchant, "Imported");
  });

  it("passes the adapter contract for OFX and CSV", () => {
    assertStatementParserContract(ofxStatementParser, [ofx]);
    assertStatementParserContract(csvStatementParser, [csv]);
  });
});
