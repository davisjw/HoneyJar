#!/usr/bin/env node
/**
 * Signs in to a fresh sample household and checks the screens a person
 * actually uses. It does not click every button. The dev server must already
 * be on port 8080.
 */
import { chromium } from "playwright";

const base = process.env.UI_BASE || "http://127.0.0.1:8080";
const email = `ui-${Date.now()}@honeyjar.test`;
const password = "honeyjar-test";

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const pageErrors = [];
page.on("pageerror", (err) => pageErrors.push(String(err?.message || err)));

async function heading(name) {
  await page.getByRole("heading", { name, exact: true }).waitFor({ timeout: 20000 });
}

async function nav(name) {
  await page.locator("aside").getByRole("link", { name, exact: true }).click();
}

async function openSwitcher() {
  const trigger = page.locator("aside button[aria-expanded]");
  if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
  await page.locator("aside").getByRole("link", { name: "Manage jars" }).waitFor({ timeout: 5000 });
}

async function pick(name) {
  await openSwitcher();
  await page.locator("aside").getByRole("button", { name, exact: true }).click();
}

try {
  const probe = await fetch(base, { signal: AbortSignal.timeout(4000) });
  if (!probe.ok) throw new Error(`dev server answered ${probe.status}`);

  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.getByRole("button", { name: "Need an account" }).click();
  await page.getByPlaceholder("Your name").fill("Ada Calder");
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("Sample household").waitFor({ timeout: 45000 });
  await page.locator("aside").getByRole("link", { name: "Spending", exact: true }).waitFor();

  await nav("Transactions");
  await heading("Transactions");
  await page.getByText("Northwind Payroll").first().waitFor();

  await nav("Net worth");
  await heading("Net worth");

  await nav("Taxes");
  await heading("Taxes");

  await nav("Portfolio");
  await heading("Portfolio");

  await pick("Summary");
  await heading("All jars");
  await page.getByText("Calder Studio").first().waitFor();
  await page.getByText("Maple Street").first().waitFor();

  await pick("Calder Studio");
  await heading("Calder Studio");
  await page.locator("aside").getByRole("link", { name: "Invoices", exact: true }).waitFor();
  await page.locator("aside").getByRole("link", { name: "Mileage", exact: true }).waitFor();

  await nav("Invoices");
  await heading("Invoices");

  await pick("Maple Street");
  await heading("Maple Street");
  await nav("Leases");
  await heading("Leases");

  await pick("Calder household");
  await page.locator("aside").getByRole("link", { name: "Spending", exact: true }).waitFor();
  await page.getByText("Jordan Calder").first().waitFor();

  if (pageErrors.length) throw new Error(pageErrors.join("\n"));
  console.log(`ui smoke ok (${email})`);
} catch (err) {
  const shot = "/workspace/artifacts/ui-smoke-failure.png";
  await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
  console.error(err instanceof Error ? err.message : err);
  const aside = await page.locator("aside").innerText().catch(() => "");
  if (aside) console.error(aside);
  if (pageErrors.length) console.error(pageErrors.join("\n"));
  console.error(`screenshot ${shot}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
