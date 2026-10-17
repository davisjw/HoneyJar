import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { personEmail } from "./person.ts";

describe("person sign-in link", () => {
  it("keeps a child off the sign-in list", () => {
    assert.equal(personEmail("child", "kid@example.com"), "");
    assert.equal(personEmail("child", ""), "");
  });

  it("stores an adult email in one form", () => {
    assert.equal(personEmail("adult", "  Avery@Example.com "), "avery@example.com");
    assert.equal(personEmail("other", ""), "");
  });

  it("rejects a broken email", () => {
    assert.throws(() => personEmail("adult", "not-an-email"), /does not look right/);
  });
});
