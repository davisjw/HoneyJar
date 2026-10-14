import { createHash } from "node:crypto";
import { getSql, type Sql } from "@/lib/db";
import {
  evaluateAlerts,
  money,
  netWorthParts,
  periodOf,
  planModel,
  spendingByCategory,
  periodStart,
} from "./calc";
import { applyAction, loadWorkspace } from "./data.server";

function cors(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  return new Response(res.body, { status: res.status, headers });
}

function json(data: unknown, status = 200) {
  return cors(Response.json(data, { status }));
}

async function userFromKey(sql: Sql, request: Request): Promise<string | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const hash = createHash("sha256").update(token).digest("hex");
  const rows = await sql<{ id: string; user_id: string }>`select id, user_id from api_keys where token_hash = ${hash}`;
  if (!rows[0]) return null;
  await sql`update api_keys set last_used = now() where id = ${rows[0].id}`;
  return rows[0].user_id;
}

function apiPath(request: Request): string {
  const pathname = new URL(request.url).pathname;
  const idx = pathname.indexOf("/api/v1");
  const rest = idx >= 0 ? pathname.slice(idx + "/api/v1".length) : pathname;
  return rest.replace(/\/$/, "") || "/";
}

export async function handlePublicApi(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
  try {
    const sql = await getSql();
    const userId = await userFromKey(sql, request);
    if (!userId) return json({ error: "Send Authorization: Bearer hj_…" }, 401);
    const ws = await loadWorkspace(userId);
    const path = apiPath(request);
    const url = new URL(request.url);
    if (request.method === "GET" && (path === "" || path === "/")) {
      return json({
        name: "HoneyJar",
        household: ws.profile.displayName,
        endpoints: ["/summary", "/accounts", "/transactions", "/bills", "/goals", "/networth", "/alerts"],
      });
    }
    if (request.method === "GET" && path === "/summary") {
      const month = periodOf(ws.today, ws.profile.monthStartDay);
      const from = periodStart(month, ws.profile.monthStartDay);
      const spend = spendingByCategory(ws.transactions, ws.categories, from, ws.today);
      const nw = netWorthParts(ws.accounts, ws.assets);
      return json({
        today: ws.today,
        currency: ws.profile.currency,
        netWorth: money(nw.net, ws.profile.currency),
        netWorthCents: nw.net,
        spendingThisMonth: spend.map((s) => ({ category: s.name, cents: s.cents })),
      });
    }
    if (request.method === "GET" && path === "/accounts") {
      return json({ accounts: ws.accounts.filter((a) => !a.archived) });
    }
    if (request.method === "GET" && path === "/transactions") {
      const from = url.searchParams.get("from") ?? "";
      const to = url.searchParams.get("to") ?? "9999-99-99";
      const limit = Math.min(200, Number(url.searchParams.get("limit") ?? 50) || 50);
      const rows = ws.transactions.filter((t) => (!from || t.postedOn >= from) && t.postedOn <= to).slice(0, limit);
      return json({ transactions: rows });
    }
    if (request.method === "GET" && path === "/bills") return json({ bills: ws.bills });
    if (request.method === "GET" && path === "/goals") return json({ goals: ws.goals });
    if (request.method === "GET" && path === "/networth") {
      return json({ ...netWorthParts(ws.accounts, ws.assets), assetsDetail: ws.assets });
    }
    if (request.method === "GET" && path === "/alerts") {
      const month = periodOf(ws.today, ws.profile.monthStartDay);
      const plan = planModel(ws.categories, ws.transactions, ws.plan, month, ws.profile.monthStartDay);
      const alerts = evaluateAlerts({
        today: ws.today,
        startDay: ws.profile.monthStartDay,
        accounts: ws.accounts,
        categories: ws.categories,
        txns: ws.transactions,
        bills: ws.bills,
        goals: ws.goals,
        watches: ws.watches,
        reminders: ws.reminders,
        scores: ws.scores,
        planRows: plan.rows,
      });
      return json({ alerts });
    }
    if (request.method === "POST" && path === "/transactions") {
      const body = (await request.json()) as {
        accountId?: string;
        postedOn?: string;
        amountCents?: number;
        merchant?: string;
        memo?: string;
        categoryId?: string;
        personId?: string;
        tags?: string[];
      };
      if (!body.accountId || !body.merchant || body.amountCents == null) {
        return json({ error: "accountId, merchant, and amountCents are required." }, 400);
      }
      await applyAction(userId, {
        type: "txn.save",
        txn: {
          accountId: body.accountId,
          postedOn: body.postedOn || ws.today,
          amountCents: body.amountCents,
          merchant: body.merchant,
          memo: body.memo ?? "",
          categoryId: body.categoryId ?? null,
          source: "api",
          personId: body.personId ?? null,
          tags: Array.isArray(body.tags) ? body.tags : [],
        },
      });
      return json({ ok: true });
    }
    return json({ error: "Unknown path." }, 404);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed";
    return json({ error: message }, 400);
  }
}

const TOOLS = [
  { name: "spending_summary", description: "This month's spending by category and net worth." },
  { name: "list_accounts", description: "Balances for every account." },
  { name: "list_transactions", description: "Recent transactions. Optional from, to, limit." },
  { name: "upcoming_bills", description: "Bills, subscriptions, and expected income." },
  { name: "net_worth", description: "Assets, debts, and net worth." },
  { name: "list_goals", description: "Savings goals and progress." },
  { name: "list_alerts", description: "Open watchlist and bill alerts, each with a path inside HoneyJar." },
];

export async function handleMcp(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
  try {
    const sql = await getSql();
    const userId = await userFromKey(sql, request);
    if (!userId) return json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized" } }, 401);
    const body = (await request.json()) as {
      jsonrpc?: string;
      id?: number | string;
      method?: string;
      params?: { name?: string; arguments?: Record<string, unknown> };
    };
    const id = body.id ?? null;
    if (body.method === "initialize" || body.method === "tools/list") {
      return json({ jsonrpc: "2.0", id, result: { protocolVersion: "2025-03-26", tools: TOOLS } });
    }
    if (body.method === "tools/call") {
      const name = body.params?.name ?? "";
      const fake = new Request(new URL(`/api/v1/${toolPath(name)}`, request.url), {
        headers: request.headers,
      });
      const inner = await handlePublicApi(fake);
      const payload = await inner.json();
      return json({
        jsonrpc: "2.0",
        id,
        result: { content: [{ type: "text", text: JSON.stringify(payload) }] },
      });
    }
    return json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "MCP failed";
    return json({ jsonrpc: "2.0", id: null, error: { code: -32000, message } }, 400);
  }
}

function toolPath(name: string): string {
  if (name === "list_accounts") return "accounts";
  if (name === "list_transactions") return "transactions";
  if (name === "upcoming_bills") return "bills";
  if (name === "net_worth") return "networth";
  if (name === "list_goals") return "goals";
  if (name === "list_alerts") return "alerts";
  return "summary";
}
