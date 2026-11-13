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
  portfolioPerformance,
} from "./calc";
import { apiDocument, hitLimit, keyExpired } from "./care";
import { applyAction, loadWorkspace } from "./data.server";
import { toolsForScope } from "./mcp-tools";

const keyHits = new Map<string, number[]>();

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

type KeyAuth = { userId: string; scope: "read" | "write" };

async function userFromKey(sql: Sql, request: Request, count = true): Promise<KeyAuth | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const hash = createHash("sha256").update(token).digest("hex");
  const rows = await sql<{ id: string; user_id: string; expires_at: string | null; scope: string | null }>`
    select id, user_id, expires_at, scope from api_keys where token_hash = ${hash}
  `;
  const row = rows[0];
  if (!row) return null;
  if (keyExpired(row.expires_at)) return null;
  if (count) {
    const hit = hitLimit(keyHits.get(row.id) ?? [], Date.now(), 60_000, 60);
    keyHits.set(row.id, hit.next);
    if (hit.limited) throw new Error("Too many requests. Wait a minute.");
  }
  await sql`update api_keys set last_used = now() where id = ${row.id}`;
  return { userId: row.user_id, scope: row.scope === "read" ? "read" : "write" };
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
    const auth = await userFromKey(sql, request);
    if (!auth) return json({ error: "Send Authorization: Bearer hj_…" }, 401);
    const userId = auth.userId;
    const ws = await loadWorkspace(userId);
    const path = apiPath(request);
    const url = new URL(request.url);
    if (request.method === "GET" && (path === "" || path === "/")) {
      return json({
        name: "HoneyJar",
        household: ws.profile.displayName,
        endpoints: ["/summary", "/accounts", "/transactions", "/bills", "/goals", "/networth", "/portfolio", "/alerts", "/people", "/documents", "/utilities", "/jars"],
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
    if (request.method === "GET" && path === "/portfolio") {
      const perf = portfolioPerformance({ lots: ws.lots, prices: ws.prices, flows: ws.flows, today: ws.today });
      return json({
        ...perf,
        lots: ws.lots,
        prices: ws.prices,
        flows: ws.flows,
        sketches: ws.sketches,
      });
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
    if (request.method === "GET" && path === "/people") return json({ people: ws.people });
    if (request.method === "GET" && path === "/documents") {
      return json({ documents: ws.documents.map(apiDocument) });
    }
    if (request.method === "GET" && path === "/utilities") {
      return json({ meters: ws.meters, columns: ws.columns, readings: ws.readings });
    }
    if (request.method === "GET" && path === "/jars") {
      const id = url.searchParams.get("id") ?? "";
      const from = url.searchParams.get("from") ?? "";
      const to = url.searchParams.get("to") ?? "9999-99-99";
      const limit = Math.min(200, Number(url.searchParams.get("limit") ?? 50) || 50);
      const jars = ws.ledgers.map((book) => {
        const base = {
          id: book.id,
          name: book.name,
          kind: book.kind,
          taxForm: book.taxForm,
          activity: book.activity,
          archived: book.archived,
          accounts: book.accounts,
        };
        if (id && book.id !== id) return base;
        if (!id) return base;
        const transactions = book.transactions.filter((t) => (!from || t.postedOn >= from) && t.postedOn <= to).slice(0, limit);
        return { ...base, bills: book.bills, transactions };
      });
      return json({ jars });
    }
    if (request.method === "POST" && path === "/transactions") {
      if (auth.scope !== "write") return json({ error: "This key is read-only." }, 403);
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
      const amountCents = body.amountCents;
      if (!body.accountId || !body.merchant || typeof amountCents !== "number" || !Number.isInteger(amountCents)) {
        return json({ error: "accountId, merchant, and an integer amountCents are required." }, 400);
      }
      await applyAction(userId, {
        type: "txn.save",
        txn: {
          accountId: body.accountId,
          postedOn: body.postedOn || ws.today,
          amountCents,
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
    return json({ error: message }, message.startsWith("Too many") ? 429 : 400);
  }
}

export async function handleMcp(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
  try {
    const sql = await getSql();
    const body = (await request.json()) as {
      jsonrpc?: string;
      id?: number | string;
      method?: string;
      params?: { name?: string; arguments?: Record<string, unknown> };
    };
    const auth = await userFromKey(sql, request, body.method !== "tools/call");
    if (!auth) return json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized" } }, 401);
    const id = body.id ?? null;
    if (body.method === "initialize" || body.method === "tools/list") {
      return json({ jsonrpc: "2.0", id, result: { protocolVersion: "2025-03-26", tools: toolsForScope(auth.scope) } });
    }
    if (body.method === "tools/call") {
      const name = body.params?.name ?? "";
      const args = body.params?.arguments ?? {};
      if (name === "add_transaction" && auth.scope !== "write") {
        return json({ jsonrpc: "2.0", id, error: { code: -32001, message: "This key is read-only." } }, 403);
      }
      const query = new URLSearchParams();
      for (const key of ["from", "to", "limit", "id"] as const) {
        const value = args[key];
        if (value != null && String(value)) query.set(key, String(value));
      }
      const headers = new Headers(request.headers);
      headers.delete("content-length");
      const fake = new Request(new URL(`/api/v1/${toolPath(name)}?${query}`, request.url), {
        method: name === "add_transaction" ? "POST" : "GET",
        headers,
        body: name === "add_transaction" ? JSON.stringify(args) : undefined,
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
  if (name === "list_transactions" || name === "add_transaction") return "transactions";
  if (name === "upcoming_bills") return "bills";
  if (name === "net_worth") return "networth";
  if (name === "portfolio") return "portfolio";
  if (name === "list_goals") return "goals";
  if (name === "list_alerts") return "alerts";
  if (name === "list_people") return "people";
  if (name === "list_documents") return "documents";
  if (name === "list_utilities") return "utilities";
  if (name === "list_jars") return "jars";
  return "summary";
}
