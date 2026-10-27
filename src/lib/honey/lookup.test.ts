import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseContactHtml, preferredWebsite, searchResultUrls } from "./lookup.ts";

describe("contact lookup", () => {
  it("skips a directory and keeps the business site", () => {
    const html = `<a href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.yelp.com%2Fbiz%2Fblue&rut=1">Yelp</a>
      <a href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.bluebottlecoffee.com%2F&rut=1">Site</a>`;
    assert.equal(preferredWebsite(searchResultUrls(html)), "https://www.bluebottlecoffee.com/");
  });

  it("reads the phone, address, and hours the site publishes", () => {
    const html = `<script type="application/ld+json">
      {"@type":"LocalBusiness","name":"Blue Bottle Coffee","telephone":"1-510-555-0100","url":"https://bluebottlecoffee.com","email":"hi@bluebottlecoffee.com","openingHours":"Mo-Fr 07:00-18:00","address":{"streetAddress":"300 Webster","addressLocality":"Oakland","addressRegion":"CA","postalCode":"94607"}}
    </script>`;
    const found = parseContactHtml(html, "https://bluebottlecoffee.com/contact");
    assert.equal(found.name, "Blue Bottle Coffee");
    assert.equal(found.phone, "1-510-555-0100");
    assert.equal(found.street, "300 Webster");
    assert.equal(found.city, "Oakland");
    assert.equal(found.region, "CA");
    assert.equal(found.postal, "94607");
    assert.equal(found.hours, "Mo-Fr 07:00-18:00");
    assert.equal(found.email, "hi@bluebottlecoffee.com");
  });
});
