import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type { Action, ActionResult, Workspace } from "./types";

export const getWorkspace = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { ownerId?: string } | undefined) => input ?? {})
  .handler(async ({ context, data }): Promise<Workspace> => {
    const { loadWorkspace } = await import("./data.server");
    return loadWorkspace(context.userId, data.ownerId);
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

    if (ws.profile.aiProvider === "ollama") {
      return {
        mode: "ollama" as const,
        url: ws.profile.ollamaUrl,
        model: ws.profile.ollamaModel,
        system,
        question: data.question,
      };
    }

    const history = ws.messages.slice(-8).map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));
    const messages = [
      { role: "system", content: system },
      ...history,
      { role: "user", content: data.question },
    ];

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
    const sql = await getSql();
    const { randomBytes } = await import("node:crypto");
    const a = randomBytes(8).toString("hex");
    const b = randomBytes(8).toString("hex");
    await sql`insert into ai_messages (id, user_id, role, content) values (${a}, ${ws.ownerId}, 'user', ${data.question})`;
    await sql`insert into ai_messages (id, user_id, role, content) values (${b}, ${ws.ownerId}, 'assistant', ${text})`;
    return { mode: "answer" as const, text };
  });
