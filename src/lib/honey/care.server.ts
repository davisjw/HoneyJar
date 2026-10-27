import { randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import type { Sql } from "@/lib/db";
import { hashRecoveryCode, makeRecoveryCode, namesMatch, publicExport } from "./care";

function nid(): string {
  return randomBytes(9).toString("hex");
}

export async function recordAudit(sql: Sql, userId: string, action: string, detail = ""): Promise<void> {
  await sql`
    insert into audit_events (id, user_id, action, detail)
    values (${nid()}, ${userId}, ${action.slice(0, 40)}, ${detail.slice(0, 200)})
  `;
}

export async function listAudit(sql: Sql, userId: string) {
  const rows = await sql<{ id: string; action: string; detail: string; created_at: string }>`
    select id, action, detail, created_at from audit_events
    where user_id = ${userId}
    order by created_at desc
    limit 100
  `;
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    detail: r.detail,
    createdAt: String(r.created_at),
  }));
}

export async function hasLocalPassword(sql: Sql, userId: string): Promise<boolean> {
  const rows = await sql<{ n: number }>`
    select count(*)::int as n from "account"
    where "userId" = ${userId} and "providerId" = 'credential' and password is not null
  `;
  return Number(rows[0]?.n ?? 0) > 0;
}
export async function issueRecoveryCode(sql: Sql, userId: string): Promise<string> {
  if (!(await hasLocalPassword(sql, userId))) {
    throw new Error("This sign-in uses a directory and has no HoneyJar password.");
  }
  const code = makeRecoveryCode(randomBytes(16));
  const hash = hashRecoveryCode(code);
  await sql`
    insert into recovery_codes (user_id, code_hash)
    values (${userId}, ${hash})
    on conflict (user_id) do update set code_hash = ${hash}, created_at = now()
  `;
  await recordAudit(sql, userId, "recovery.issue", "");
  return code;
}

export async function redeemRecoveryCode(sql: Sql, email: string, code: string, newPassword: string): Promise<void> {
  if (newPassword.length < 8) throw new Error("Use at least 8 characters.");
  const users = await sql<{ id: string }>`select id from "user" where lower(email) = ${email.trim().toLowerCase()} limit 1`;
  const user = users[0];
  const hash = hashRecoveryCode(code);
  const rows = user
    ? await sql<{ user_id: string }>`select user_id from recovery_codes where user_id = ${user.id} and code_hash = ${hash}`
    : [];
  if (!user || !rows[0]) throw new Error("That recovery code does not match.");
  const password = await hashPassword(newPassword);
  const accounts = await sql`select id from "account" where "userId" = ${user.id} and "providerId" = 'credential'`;
  if (!accounts.length) throw new Error("This sign-in has no password to replace.");
  await sql`update "account" set password = ${password}, "updatedAt" = now() where "userId" = ${user.id} and "providerId" = 'credential'`;
  await sql`delete from "session" where "userId" = ${user.id}`;
  await sql`delete from recovery_codes where user_id = ${user.id}`;
  await recordAudit(sql, user.id, "recovery.use", "");
}

export async function deleteOwnedAccount(sql: Sql, userId: string, confirm: string): Promise<void> {
  const profile = await sql<{ display_name: string }>`select display_name from profiles where user_id = ${userId}`;
  const name = profile[0]?.display_name ?? "";
  if (!namesMatch(confirm, name)) throw new Error("Type the household name to delete it.");
  await recordAudit(sql, userId, "account.delete", name);
  for (const table of [
    "accounts",
    "categories",
    "rules",
    "people",
    "transactions",
    "bills",
    "bill_payments",
    "assets",
    "valuations",
    "snapshots",
    "goals",
    "contributions",
    "plan_months",
    "watchlists",
    "alert_reads",
    "reminders",
    "documents",
    "credit_scores",
    "contacts",
    "milestones",
    "reports",
    "api_keys",
    "ai_messages",
    "ledgers",
    "draws",
    "lots",
    "prices",
    "portfolio_flows",
    "retirement_sketches",
    "invoices",
    "mileage",
    "leases",
    "realizations",
    "utility_meters",
    "utility_columns",
    "utility_readings",
    "profiles",
    "recovery_codes",
    "audit_events",
  ]) {
    await sql.query(`delete from ${table} where user_id = $1`, [userId]);
  }
  await sql`delete from book_access where owner_user_id = ${userId} or member_user_id = ${userId}`;
  await sql`delete from "session" where "userId" = ${userId}`;
  await sql`delete from "account" where "userId" = ${userId}`;
  await sql`delete from "verification" where value = ${userId}`;
  await sql`delete from "user" where id = ${userId}`;
}

export async function exportOwned(sql: Sql, userId: string) {
  const { readWorkspace } = await import("./data.server");
  const ws = await readWorkspace(sql, userId, undefined, { window: false });
  await recordAudit(sql, userId, "export", "");
  return publicExport(ws);
}
