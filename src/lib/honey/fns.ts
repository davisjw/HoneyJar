import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type { Action, ActionResult, Workspace } from "./types";

export const getWorkspace = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { ownerId?: string; ledgerId?: string; txnSince?: string; window?: boolean } | undefined) => {
    const raw = input ?? {};
    const txnSince = typeof raw.txnSince === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.txnSince) ? raw.txnSince : undefined;
    const ledgerId = typeof raw.ledgerId === "string" ? raw.ledgerId.slice(0, 80) : undefined;
    return { ownerId: raw.ownerId, ledgerId, txnSince, window: raw.window === true };
  })
  .handler(async ({ context, data }): Promise<Workspace> => {
    const { loadWorkspace } = await import("./data.server");
    return loadWorkspace(context.userId, data.ownerId, {
      window: data.window,
      focusLedgerId: data.ledgerId,
      txnSince: data.txnSince,
    });
  });

export const applyAction = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: Action) => {
    if (!input || typeof input !== "object" || typeof (input as Action).type !== "string") {
      throw new Error("Bad request");
    }
    return input;
  })
  .handler(async ({ context, data }): Promise<ActionResult> => {
    const { applyAction: run } = await import("./data.server");
    return run(context.userId, data);
  });

export const askAdvisor = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { question: string; ownerId?: string }) => {
    const question = String(input?.question ?? "").trim().slice(0, 2000);
    if (!question) throw new Error("Ask a question first.");
    return { question, ownerId: input.ownerId };
  })
  .handler(async ({ context, data }) => {
    const { advisorContext } = await import("./data.server");
    const { advisorBrief, portfolioPerformance } = await import("./calc");
    const { getSql } = await import("@/lib/db");
    const ws = await advisorContext(context.userId, data.ownerId);
    const brief = advisorBrief({
      profile: ws.profile,
      today: ws.today,
      accounts: ws.accounts,
      categories: ws.categories,
      txns: ws.transactions,
      bills: ws.bills,
      goals: ws.goals,
      assets: ws.assets,
      portfolio: ws.lots.length
        ? (() => {
            const perf = portfolioPerformance({ lots: ws.lots, prices: ws.prices, flows: ws.flows, today: ws.today });
            return { marketCents: perf.marketCents, irr: perf.irr, dietz: perf.dietz, dietzAnnual: perf.dietzAnnual };
          })()
        : undefined,
    });
    const system = [
      "You are HoneyJar, a calm guide for this household's money.",
      "Use only the figures in the brief. If a number is not there, say you don't have it.",
      "Give a short answer with one or two concrete next steps.",
      "When a screen in the app would help, name it: Spending, Transactions, Bills, Spending plan, Cash flow, Net worth, Portfolio, Goals, Milestones, Reports, Taxes, Credit, Watchlists, Reminders, Documents, Accounts.",
      "You are not filing a return and you are not a broker.",
      "",
      brief,
    ].join("\n");

    const history = ws.messages.slice(-8).map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));
    const messages = [
      { role: "system", content: system },
      ...history,
      { role: "user", content: data.question },
    ];

    if (ws.profile.aiProvider === "ollama") {
      const base = ws.profile.ollamaUrl.trim().replace(/\/$/, "");
      let parsed: URL;
      try {
        parsed = new URL(base);
      } catch {
        throw new Error("The Ollama address is not a URL.");
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("The Ollama address has to start with http:// or https://.");
      }
      const endpoint = base.endsWith("/api/chat") ? base : `${base}/api/chat`;
      let res: Response;
      try {
        res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(120_000),
          body: JSON.stringify({ model: ws.profile.ollamaModel || "llama3.1", stream: false, messages }),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : "";
        if (/certificate|UNABLE_TO_VERIFY/i.test(`${message} ${cause}`)) {
          throw new Error("HoneyJar reached Ollama but does not trust its certificate. Use a public certificate, or trust the issuer the same way as OpenID Connect.");
        }
        throw new Error(`HoneyJar could not reach Ollama at ${parsed.origin}. The server makes this call, not your browser. ${message}`.slice(0, 400));
      }
      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`Ollama didn’t answer (${res.status}). ${detail.slice(0, 180)}`);
      }
      const body = (await res.json()) as { message?: { content?: string } };
      const text = body.message?.content?.trim() || "No answer came back.";
      await rememberAdvisor(ws.ownerId, data.question, text);
      return { mode: "answer" as const, text };
    }

    let url = "https://api.x.ai/v1/chat/completions";
    let key = process.env.XAI_API_KEY ?? "";
    let model = "grok-4.5";
    if (ws.profile.aiProvider === "openai") {
      const sql = await getSql();
      const rows = await sql<{ openai_key: string; openai_model: string }>`
        select openai_key, openai_model from profiles where user_id = ${ws.ownerId}
      `;
      key = rows[0]?.openai_key ?? "";
      model = rows[0]?.openai_model || "gpt-4.1-mini";
      url = "https://api.openai.com/v1/chat/completions";
      if (!key) throw new Error("Add an OpenAI API key in Customize, or switch the advisor to Grok.");
    } else if (!key) {
      throw new Error("Grok isn't available in this environment yet. Switch the advisor to Ollama or add an OpenAI key.");
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages, max_tokens: 700, temperature: 0.3 }),
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`The advisor couldn't answer (${res.status}). ${detail.slice(0, 180)}`);
    }
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = body.choices?.[0]?.message?.content?.trim() || "No answer came back.";
    await rememberAdvisor(ws.ownerId, data.question, text);
    return { mode: "answer" as const, text };
  });

async function rememberAdvisor(ownerId: string, question: string, text: string) {
  const { getSql } = await import("@/lib/db");
  const { randomBytes } = await import("node:crypto");
  const sql = await getSql();
  const a = randomBytes(8).toString("hex");
  const b = randomBytes(8).toString("hex");
  await sql`insert into ai_messages (id, user_id, role, content) values (${a}, ${ownerId}, 'user', ${question})`;
  await sql`insert into ai_messages (id, user_id, role, content) values (${b}, ${ownerId}, 'assistant', ${text})`;
}

export const exportHousehold = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("@/lib/db");
    const { exportOwned } = await import("./care.server");
    return exportOwned(await getSql(), context.userId);
  });

export const listAudit = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("@/lib/db");
    const { listAudit: read } = await import("./care.server");
    return read(await getSql(), context.userId);
  });

export const noteSignIn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("@/lib/db");
    const { recordAudit } = await import("./care.server");
    await recordAudit(await getSql(), context.userId, "sign-in", "");
    return { ok: true };
  });

export const localSignIn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("@/lib/db");
    const { hasLocalPassword } = await import("./care.server");
    return { password: await hasLocalPassword(await getSql(), context.userId) };
  });

export const changeOwnPassword = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { currentPassword?: string; newPassword?: string }) => {
    const currentPassword = String(input?.currentPassword ?? "");
    const newPassword = String(input?.newPassword ?? "");
    if (!currentPassword) throw new Error("Enter the current password.");
    if (newPassword.length < 8) throw new Error("Use at least 8 characters.");
    return { currentPassword, newPassword };
  })
  .handler(async ({ context, data }) => {
    const { auth } = await import("@/lib/auth/server");
    const { getSql } = await import("@/lib/db");
    const { hasLocalPassword, recordAudit } = await import("./care.server");
    const sql = await getSql();
    if (!(await hasLocalPassword(sql, context.userId))) {
      throw new Error("This sign-in uses a directory and has no HoneyJar password.");
    }
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    await auth.api.changePassword({
      body: { currentPassword: data.currentPassword, newPassword: data.newPassword, revokeOtherSessions: true },
      headers: request.headers,
    });
    await recordAudit(sql, context.userId, "password.change", "");
    return { ok: true };
  });

const recoveryHits = new Map<string, number[]>();

export const redeemRecoveryCode = createServerFn({ method: "POST" })
  .validator((input: { email?: string; code?: string; newPassword?: string }) => {
    const email = String(input?.email ?? "").trim().slice(0, 120);
    const code = String(input?.code ?? "").trim().slice(0, 40);
    const newPassword = String(input?.newPassword ?? "");
    if (!email || !code) throw new Error("Enter the email and the recovery code.");
    return { email, code, newPassword };
  })
  .handler(async ({ data }) => {
    const { hitLimit } = await import("./care");
    const key = data.email.toLowerCase();
    const hit = hitLimit(recoveryHits.get(key) ?? [], Date.now(), 15 * 60 * 1000, 8);
    recoveryHits.set(key, hit.next);
    if (hit.limited) throw new Error("Too many tries. Wait a few minutes.");
    const { getSql } = await import("@/lib/db");
    const { redeemRecoveryCode: redeem } = await import("./care.server");
    await redeem(await getSql(), data.email, data.code, data.newPassword);
    return { ok: true };
  });

