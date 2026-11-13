import { unzipStore } from "./zip.ts";

type Bag = Record<string, unknown>;

export type ImportFile = { id: string; dataBase64: string };

export type PlannedImport = {
  profile: {
    displayName: string;
    currency: string;
    filingStatus: string;
    stateCode: string;
    dependents: number;
    wagesCents: number;
    otherIncomeCents: number;
    withholdingCents: number;
    estimatedPaidCents: number;
    priorYearTaxCents: number;
    deductionMode: string;
    saltCapCents: number;
    stateRateBps: number;
    navHidden: string;
    aiProvider: string;
    openaiModel: string;
    ollamaUrl: string;
    ollamaModel: string;
    vaultSalt: string;
    vaultVerifier: string;
    monthStartDay: number;
  };
  jars: number;
  rows: { table: string; values: Record<string, unknown> }[];
  idMap: Map<string, string>;
};

const FILING = new Set(["single", "mfj", "mfs", "hoh"]);
const AI = new Set(["grok", "openai", "ollama"]);
const DEDUCTION = new Set(["auto", "standard", "itemized"]);

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24) || "x";
}

function asBag(value: unknown): Bag | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Bag) : null;
}

function arr(value: unknown): Bag[] {
  return Array.isArray(value) ? value.filter((item): item is Bag => Boolean(asBag(item))) : [];
}

function str(value: unknown, max = 200): string {
  return String(value ?? "").slice(0, max);
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function day(value: unknown): string | null {
  const text = String(value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function bool(value: unknown): boolean {
  return value === true;
}

function encodeBase64(data: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < data.length; i += 0x8000) {
    bin += String.fromCharCode(...data.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function documentIds(book: Bag): string[] {
  const ids: string[] = [];
  const take = (docs: unknown) => {
    for (const doc of arr(docs)) {
      const id = str(doc.id, 80);
      if (id) ids.push(id);
    }
  };
  take(book.documents);
  for (const ledger of arr(book.ledgers)) take(ledger.documents);
  return ids;
}

function matchDocument(name: string, ids: string[]): string {
  const base = name.startsWith("files/") ? name.slice("files/".length) : name;
  let hit = "";
  for (const id of ids) {
    if ((base === id || base.startsWith(`${id}-`)) && id.length > hit.length) hit = id;
  }
  return hit;
}

/** Transactions stored on the jars in an export. The root list is the same personal jar, not a second copy. */
export function countExportedTransactions(book: unknown): number {
  const root = asBag(book);
  return arr(root?.ledgers).reduce((sum, ledger) => sum + arr(ledger.transactions).length, 0);
}

/** A HoneyJar zip, or a honeyjar.json file saved on its own. */
export function parseExportFile(bytes: Uint8Array): { book: unknown; files: ImportFile[] } {
  if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const entries = unzipStore(bytes);
    const json = entries.find((entry) => entry.name === "honeyjar.json" || entry.name.endsWith("/honeyjar.json"));
    if (!json) throw new Error("This zip has no honeyjar.json.");
    let book: unknown;
    try {
      book = JSON.parse(new TextDecoder().decode(json.data)) as unknown;
    } catch {
      throw new Error("This file is not a HoneyJar export.");
    }
    const ids = documentIds(asBag(book) ?? {});
    const files: ImportFile[] = [];
    for (const entry of entries) {
      if (!entry.name.startsWith("files/")) continue;
      const id = matchDocument(entry.name, ids);
      if (!id) continue;
      files.push({ id, dataBase64: encodeBase64(entry.data) });
    }
    return { book, files };
  }
  try {
    return { book: JSON.parse(new TextDecoder().decode(bytes)) as unknown, files: [] };
  } catch {
    throw new Error("This file is not a HoneyJar export.");
  }
}

/** Rows for one sign-in. Ids are rewritten so they cannot collide with another household. */
export function planImport(book: unknown, userId: string): PlannedImport {
  const root = asBag(book);
  const profile = asBag(root?.profile);
  const ledgers = arr(root?.ledgers);
  if (!root || !profile || !Array.isArray(root.ledgers)) throw new Error("This file is not a HoneyJar export.");
  const owner = str(userId, 80);
  if (!owner) throw new Error("Sign in before importing.");
  const homeId = `p_${slug(owner)}_home`;
  const personal = ledgers.find((ledger) => ledger.kind === "personal" && ledger.archived !== true) ?? ledgers.find((ledger) => ledger.kind === "personal");
  const ids = new Map<string, string>();
  let n = 0;
  const take = (old: unknown, fixed?: string): string => {
    const key = str(old, 80);
    if (!key) return "";
    const existing = ids.get(key);
    if (existing) return existing;
    const next = fixed ?? `imp_${slug(owner)}_${(n += 1).toString(36)}`;
    ids.set(key, next);
    return next;
  };
  const ref = (old: unknown): string | null => {
    const key = str(old, 80);
    if (!key) return null;
    return ids.get(key) ?? key;
  };

  if (personal) take(personal.id, homeId);
  for (const ledger of ledgers) {
    take(ledger.id);
    for (const row of arr(ledger.accounts)) take(row.id);
    for (const row of arr(ledger.categories)) take(row.id);
    for (const row of arr(ledger.transactions)) take(row.id);
    for (const row of arr(ledger.bills)) take(row.id);
    for (const row of arr(ledger.rules)) take(row.id);
    for (const row of arr(ledger.plan)) take(row.id);
    for (const row of arr(ledger.goals)) take(row.id);
    for (const row of arr(ledger.milestones)) take(row.id);
    for (const row of arr(ledger.watches)) take(row.id);
    for (const row of arr(ledger.reminders)) take(row.id);
    for (const row of arr(ledger.documents)) take(row.id);
    for (const row of arr(ledger.reports)) take(row.id);
    for (const row of arr(ledger.invoices)) take(row.id);
    for (const row of arr(ledger.trips)) take(row.id);
    for (const row of arr(ledger.leases)) take(row.id);
    for (const row of arr(ledger.draws)) take(row.id);
    for (const row of arr(ledger.meters)) take(row.id);
    for (const row of arr(ledger.columns)) take(row.id);
    for (const row of arr(ledger.readings)) take(row.id);
  }
  for (const list of [root.people, root.contacts, root.payments, root.assets, root.valuations, root.snapshots, root.contributions, root.scores, root.lots, root.prices, root.flows, root.realizations, root.sketches, root.messages]) {
    for (const row of arr(list)) take(row.id);
  }

  const rows: PlannedImport["rows"] = [];
  const add = (table: string, values: Record<string, unknown>) => {
    if ("id" in values && !values.id) return;
    rows.push({ table, values });
  };
  const seen = new Set<string>();
  const once = (key: string) => {
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };

  ledgers.forEach((ledger, index) => {
    const ledgerId = take(ledger.id);
    const kind = ledger.kind === "personal" ? "personal" : ledger.kind === "property" ? "property" : "business";
    add("ledgers", {
      id: ledgerId,
      user_id: owner,
      name: str(ledger.name, 80) || "Jar",
      tax_form: kind === "personal" ? "" : str(ledger.taxForm, 8),
      activity: str(ledger.activity, 200),
      archived: bool(ledger.archived),
      sort: index,
      kind,
    });
    for (const row of arr(ledger.accounts)) {
      add("accounts", {
        id: take(row.id),
        user_id: owner,
        name: str(row.name, 80) || "Account",
        institution: str(row.institution, 80),
        kind: str(row.kind, 40) || "checking",
        mask: str(row.mask, 8),
        balance_cents: num(row.balanceCents),
        limit_cents: row.limitCents == null ? null : num(row.limitCents),
        apr_bps: row.aprBps == null ? null : num(row.aprBps),
        connected: bool(row.connected),
        archived: bool(row.archived),
        opened_on: day(row.openedOn),
        custom_json: str(row.customJson, 4000) || "[]",
        ledger_id: ledgerId,
      });
    }
    for (const row of arr(ledger.categories)) {
      add("categories", {
        id: take(row.id),
        user_id: owner,
        name: str(row.name, 80) || "Category",
        section: str(row.section, 40) || "Everyday",
        flow: str(row.flow, 20) || "out",
        tax_schedule: str(row.taxSchedule, 8),
        tax_line: str(row.taxLine, 40),
        icon: str(row.icon, 40) || "tag",
        monthly_cents: num(row.monthlyCents),
        rollover: row.rollover !== false,
        sort: num(row.sort),
        archived: bool(row.archived),
        ledger_id: ledgerId,
      });
    }
    for (const row of arr(ledger.transactions)) {
      const posted = day(row.postedOn);
      const accountId = ref(row.accountId);
      if (!posted || !accountId) continue;
      add("transactions", {
        id: take(row.id),
        user_id: owner,
        account_id: accountId,
        category_id: ref(row.categoryId),
        posted_on: posted,
        amount_cents: num(row.amountCents),
        merchant: str(row.merchant, 120),
        memo: str(row.memo, 240),
        pending: bool(row.pending),
        tax_schedule: str(row.taxSchedule, 8),
        tax_line: str(row.taxLine, 40),
        reviewed: row.reviewed !== false,
        source: str(row.source, 40) || "manual",
        person_id: ref(row.personId),
        tags: JSON.stringify(Array.isArray(row.tags) ? row.tags.map((tag) => str(tag, 40)).filter(Boolean) : []),
        ledger_id: ledgerId,
      });
    }
    for (const row of arr(ledger.bills)) {
      const due = day(row.nextDue);
      if (!due) continue;
      add("bills", {
        id: take(row.id),
        user_id: owner,
        name: str(row.name, 80) || "Bill",
        payee: str(row.payee, 80),
        kind: str(row.kind, 40) || "bill",
        direction: str(row.direction, 8) || "out",
        category_id: ref(row.categoryId),
        account_id: ref(row.accountId),
        debt_account_id: ref(row.debtAccountId),
        amount_cents: num(row.amountCents),
        principal_cents: row.principalCents == null ? null : num(row.principalCents),
        cadence: str(row.cadence, 20) || "monthly",
        next_due: due,
        autopay: bool(row.autopay),
        status: str(row.status, 20) || "active",
        variable: bool(row.variable),
        notes: str(row.notes, 400),
        url: str(row.url, 200),
        person_id: ref(row.personId),
        meter_id: ref(row.meterId),
        flat_pay: bool(row.flatPay),
        ledger_id: ledgerId,
      });
    }
    for (const row of arr(ledger.rules)) {
      add("rules", {
        id: take(row.id),
        user_id: owner,
        pattern: str(row.pattern, 80),
        category_id: ref(row.categoryId) ?? "",
        priority: num(row.priority),
        ledger_id: ledgerId,
      });
    }
    for (const row of arr(ledger.plan)) {
      const month = str(row.month, 7);
      const categoryId = ref(row.categoryId);
      if (!/^\d{4}-\d{2}$/.test(month) || !categoryId) continue;
      if (!once(`plan:${categoryId}:${month}`)) continue;
      add("plan_months", {
        id: take(row.id),
        user_id: owner,
        category_id: categoryId,
        month,
        assigned_cents: num(row.assignedCents),
        ledger_id: ledgerId,
      });
    }
    for (const row of arr(ledger.goals)) {
      add("goals", {
        id: take(row.id),
        user_id: owner,
        name: str(row.name, 80) || "Goal",
        target_cents: num(row.targetCents),
        saved_cents: num(row.savedCents),
        target_date: day(row.targetDate),
        monthly_cents: num(row.monthlyCents),
        priority: num(row.priority),
        notes: str(row.notes, 400),
        archived: bool(row.archived),
        ledger_id: ledgerId,
      });
    }
    for (const row of arr(ledger.milestones)) {
      add("milestones", {
        id: take(row.id),
        user_id: owner,
        name: str(row.name, 80) || "Milestone",
        kind: str(row.kind, 40) || "savings",
        target_cents: num(row.targetCents),
        target_date: day(row.targetDate),
        current_cents: num(row.currentCents),
        monthly_cents: num(row.monthlyCents),
        annual_return_bps: num(row.annualReturnBps),
        notes: str(row.notes, 400),
        ledger_id: ledgerId,
      });
    }
    for (const row of arr(ledger.watches)) {
      add("watchlists", {
        id: take(row.id),
        user_id: owner,
        name: str(row.name, 80) || "Watch",
        kind: str(row.kind, 40) || "category",
        ref_id: ref(row.refId) ?? "",
        ref_name: str(row.refName, 80),
        comparator: str(row.comparator, 8) || "gt",
        threshold_cents: num(row.thresholdCents),
        enabled: row.enabled !== false,
        note: str(row.note, 200),
        ledger_id: ledgerId,
      });
    }
    for (const row of arr(ledger.reminders)) {
      const due = day(row.dueOn);
      if (!due) continue;
      add("reminders", {
        id: take(row.id),
        user_id: owner,
        title: str(row.title, 80) || "Reminder",
        due_on: due,
        href: str(row.href, 200),
        related_type: str(row.relatedType, 40),
        related_id: ref(row.relatedId) ?? "",
        done: bool(row.done),
        repeat: str(row.repeat, 20) || "none",
        notes: str(row.notes, 400),
        ledger_id: ledgerId,
      });
    }
    for (const row of arr(ledger.documents)) {
      add("documents", {
        id: take(row.id),
        user_id: owner,
        title: str(row.title, 120) || "Document",
        kind: str(row.kind, 40) || "other",
        year: row.year == null ? null : num(row.year),
        related_type: str(row.relatedType, 40),
        related_id: ref(row.relatedId) ?? "",
        notes: str(row.notes, 400),
        body: str(row.body, 200000),
        encrypted: bool(row.encrypted),
        file_name: str(row.fileName, 120),
        mime: str(row.mime, 80),
        ledger_id: ledgerId,
      });
    }
    for (const row of arr(ledger.reports)) {
      add("reports", {
        id: take(row.id),
        user_id: owner,
        name: str(row.name, 80) || "Report",
        metric: str(row.metric, 40) || "spending",
        range_key: str(row.rangeKey, 20) || "month",
        group_by: str(row.groupBy, 40) || "category",
        filters_json: str(row.filtersJson, 4000) || "{}",
        ledger_id: ledgerId,
      });
    }
    for (const row of arr(ledger.invoices)) {
      const issued = day(row.issuedOn);
      const due = day(row.dueOn);
      if (!issued || !due) continue;
      add("invoices", {
        id: take(row.id),
        user_id: owner,
        ledger_id: ledgerId,
        number: str(row.number, 40) || "INV",
        client: str(row.client, 80),
        client_email: str(row.clientEmail, 120),
        client_address: str(row.clientAddress, 120),
        client_city: str(row.clientCity, 80),
        client_region: str(row.clientRegion, 40),
        client_postal: str(row.clientPostal, 16),
        issued_on: issued,
        due_on: due,
        status: str(row.status, 20) || "open",
        notes: str(row.notes, 400),
        lines_json: JSON.stringify(Array.isArray(row.lines) ? row.lines : []),
        account_id: ref(row.accountId),
        transaction_id: ref(row.transactionId),
        paid_on: day(row.paidOn),
        lease_id: ref(row.leaseId),
      });
    }
    for (const row of arr(ledger.trips)) {
      const on = day(row.on);
      if (!on) continue;
      add("mileage", {
        id: take(row.id),
        user_id: owner,
        ledger_id: ledgerId,
        trip_on: on,
        purpose: str(row.purpose, 120) || "Trip",
        destination: str(row.destination, 120),
        use_type: str(row.use, 20) || "business",
        miles_hundredths: num(row.milesHundredths),
        parking_cents: num(row.parkingCents),
        tolls_cents: num(row.tollsCents),
      });
    }
    for (const row of arr(ledger.leases)) {
      const start = day(row.startOn);
      if (!start) continue;
      add("leases", {
        id: take(row.id),
        user_id: owner,
        ledger_id: ledgerId,
        tenant: str(row.tenant, 80) || "Tenant",
        email: str(row.email, 120),
        address: str(row.address, 120),
        city: str(row.city, 80),
        region: str(row.region, 40),
        postal: str(row.postal, 16),
        unit: str(row.unit, 40),
        rent_cents: num(row.rentCents),
        due_day: Math.min(28, Math.max(1, num(row.dueDay) || 1)),
        start_on: start,
        end_on: day(row.endOn),
        deposit_cents: num(row.depositCents),
        deposit_held_cents: num(row.depositHeldCents),
        status: str(row.status, 20) || "active",
        last_invoiced: str(row.lastInvoiced, 7),
        notes: str(row.notes, 400),
      });
    }
    for (const row of arr(ledger.draws)) {
      const posted = day(row.postedOn);
      if (!posted) continue;
      add("draws", {
        id: take(row.id),
        user_id: owner,
        ledger_id: ledgerId,
        posted_on: posted,
        direction: str(row.direction, 20) || "draw",
        amount_cents: num(row.amountCents),
        biz_account_id: ref(row.bizAccountId) ?? "",
        home_account_id: ref(row.homeAccountId) ?? "",
        biz_txn_id: "",
        home_txn_id: "",
      });
    }
    for (const row of arr(ledger.meters)) {
      add("utility_meters", {
        id: take(row.id),
        user_id: owner,
        ledger_id: ledgerId,
        name: str(row.name, 80) || "Meter",
        unit: str(row.unit, 20) || "kWh",
        provider: str(row.provider, 80),
        parent_id: ref(row.parentId),
        tiers_json: JSON.stringify(Array.isArray(row.tiers) ? row.tiers : []),
        postal: str(row.postal, 12).replace(/\D/g, "").slice(0, 5),
      });
    }
    for (const row of arr(ledger.columns)) {
      const meterId = ref(row.meterId);
      if (!meterId) continue;
      add("utility_columns", {
        id: take(row.id),
        user_id: owner,
        meter_id: meterId,
        key: str(row.key, 40),
        label: str(row.label, 80) || "Column",
        kind: str(row.kind, 20) || "number",
        unit: str(row.unit, 20),
        formula: str(row.formula, 400),
        rollup: str(row.rollup, 20),
        from_children: bool(row.fromChildren),
        carry_forward: bool(row.carryForward),
        sort: num(row.sort),
      });
    }
    for (const row of arr(ledger.readings)) {
      const readOn = day(row.readOn);
      const meterId = ref(row.meterId);
      if (!readOn || !meterId) continue;
      add("utility_readings", {
        id: take(row.id),
        user_id: owner,
        meter_id: meterId,
        read_on: readOn,
        meter_value: row.meter == null || row.meter === "" || !Number.isFinite(Number(row.meter)) ? null : Number(row.meter),
        amount_cents: num(row.amountCents),
        opening: bool(row.opening),
        reset_end: row.resetEnd == null || !Number.isFinite(Number(row.resetEnd)) ? null : Number(row.resetEnd),
        reset_start: row.resetStart == null || !Number.isFinite(Number(row.resetStart)) ? null : Number(row.resetStart),
        cells_json: JSON.stringify(row.cells && typeof row.cells === "object" ? row.cells : {}),
      });
    }
  });

  for (const row of arr(root.people)) {
    const linked = str(row.linkedUserId, 80);
    add("people", {
      id: take(row.id),
      user_id: owner,
      name: str(row.name, 80) || "Person",
      relation: str(row.relation, 20) || "adult",
      email: str(row.email, 120),
      linked_user_id: linked && linked === owner ? owner : null,
      archived: bool(row.archived),
      sort: num(row.sort),
    });
  }
  for (const row of arr(root.contacts)) {
    add("contacts", {
      id: take(row.id),
      user_id: owner,
      name: str(row.name, 80) || "Contact",
      kind: str(row.kind, 40) || "merchant",
      phone: str(row.phone, 40),
      website: str(row.website, 200),
      email: str(row.email, 120),
      street: str(row.street, 120),
      city: str(row.city, 80),
      region: str(row.region, 40),
      postal: str(row.postal, 16),
      hours: str(row.hours, 80),
      notes: str(row.notes, 400),
    });
  }
  for (const row of arr(root.payments)) {
    const paid = day(row.paidOn);
    if (!paid) continue;
    add("bill_payments", {
      id: take(row.id),
      user_id: owner,
      bill_id: ref(row.billId) ?? "",
      paid_on: paid,
      amount_cents: num(row.amountCents),
      account_id: ref(row.accountId),
      transaction_id: ref(row.transactionId),
      reading_id: ref(row.readingId),
      status: str(row.status, 20) || "paid",
    });
  }
  for (const row of arr(root.assets)) {
    const asOf = day(row.asOf);
    if (!asOf) continue;
    add("assets", {
      id: take(row.id),
      user_id: owner,
      name: str(row.name, 80) || "Asset",
      kind: str(row.kind, 40) || "other",
      value_cents: num(row.valueCents),
      as_of: asOf,
      loan_account_id: ref(row.loanAccountId),
      address: str(row.address, 120),
      zillow_url: str(row.zillowUrl, 200),
      zestimate_cents: row.zestimateCents == null ? null : num(row.zestimateCents),
      detail: str(row.detail, 400),
      custom_json: str(row.customJson, 4000) || "[]",
    });
  }
  for (const row of arr(root.valuations)) {
    const asOf = day(row.asOf);
    if (!asOf) continue;
    add("valuations", {
      id: take(row.id),
      user_id: owner,
      asset_id: ref(row.assetId) ?? "",
      as_of: asOf,
      value_cents: num(row.valueCents),
      source: str(row.source, 40) || "manual",
    });
  }
  for (const row of arr(root.snapshots)) {
    const asOf = day(row.asOf);
    if (!asOf) continue;
    add("snapshots", {
      id: take(row.id),
      user_id: owner,
      as_of: asOf,
      assets_cents: num(row.assetsCents),
      debts_cents: num(row.debtsCents),
    });
  }
  for (const row of arr(root.contributions)) {
    const on = day(row.contributedOn);
    if (!on) continue;
    add("contributions", {
      id: take(row.id),
      user_id: owner,
      goal_id: ref(row.goalId) ?? "",
      amount_cents: num(row.amountCents),
      contributed_on: on,
      note: str(row.note, 200),
    });
  }
  for (const row of arr(root.scores)) {
    const asOf = day(row.asOf);
    if (!asOf) continue;
    add("credit_scores", {
      id: take(row.id),
      user_id: owner,
      bureau: str(row.bureau, 40) || "Bureau",
      score: num(row.score),
      as_of: asOf,
      factors: str(row.factors, 400),
      person_id: ref(row.personId),
    });
  }
  for (const row of arr(root.lots)) {
    const acquired = day(row.acquiredOn);
    if (!acquired) continue;
    add("lots", {
      id: take(row.id),
      user_id: owner,
      account_id: ref(row.accountId),
      symbol: str(row.symbol, 16),
      name: str(row.name, 80),
      acquired_on: acquired,
      shares_micros: num(row.sharesMicros),
      cost_cents: num(row.costCents),
      closed_on: day(row.closedOn),
      notes: str(row.notes, 400),
    });
  }
  for (const row of arr(root.prices)) {
    const asOf = day(row.asOf);
    if (!asOf) continue;
    add("prices", {
      id: take(row.id),
      user_id: owner,
      symbol: str(row.symbol, 16),
      as_of: asOf,
      price_cents: num(row.priceCents),
    });
  }
  for (const row of arr(root.flows)) {
    const posted = day(row.postedOn);
    if (!posted) continue;
    add("portfolio_flows", {
      id: take(row.id),
      user_id: owner,
      lot_id: ref(row.lotId),
      account_id: ref(row.accountId),
      symbol: str(row.symbol, 16),
      kind: str(row.kind, 20) || "buy",
      posted_on: posted,
      amount_cents: num(row.amountCents),
      external: row.external !== false,
      transaction_id: ref(row.transactionId),
      memo: str(row.memo, 200),
    });
  }
  for (const row of arr(root.realizations)) {
    const acquired = day(row.acquiredOn);
    const sold = day(row.soldOn);
    if (!acquired || !sold) continue;
    add("realizations", {
      id: take(row.id),
      user_id: owner,
      lot_id: ref(row.lotId),
      account_id: ref(row.accountId),
      symbol: str(row.symbol, 16),
      acquired_on: acquired,
      sold_on: sold,
      shares_micros: num(row.sharesMicros),
      basis_cents: num(row.basisCents),
      proceeds_cents: num(row.proceedsCents),
      gain_cents: num(row.gainCents),
      term: str(row.term, 20) || "short",
    });
  }
  for (const row of arr(root.sketches)) {
    add("retirement_sketches", {
      id: take(row.id),
      user_id: owner,
      name: str(row.name, 80) || "Sketch",
      monthly_cents: num(row.monthlyCents),
      annual_return_bps: num(row.annualReturnBps),
      years: Math.min(60, Math.max(1, num(row.years) || 30)),
      target_cents: num(row.targetCents),
      use_portfolio: row.usePortfolio !== false,
      start_cents: num(row.startCents),
    });
  }
  for (const row of arr(root.messages)) {
    add("ai_messages", {
      id: take(row.id),
      user_id: owner,
      role: str(row.role, 20) || "user",
      content: str(row.content, 4000),
      created_at: str(row.createdAt, 40) || new Date(0).toISOString(),
    });
  }
  for (const key of Array.isArray(root.readAlerts) ? root.readAlerts : []) {
    const alert = str(key, 80);
    if (!alert || !once(`alert:${alert}`)) continue;
    add("alert_reads", { user_id: owner, alert_key: alert });
  }
  for (const row of arr(root.weather)) {
    const month = str(row.month, 7);
    const postal = str(row.postal, 12);
    if (!/^\d{4}-\d{2}$/.test(month) || !once(`weather:${postal}:${month}`)) continue;
    add("weather_months", { user_id: owner, postal, month, avg_f: num(row.avgF) });
  }

  const filing = str(profile.filingStatus, 20);
  const ai = str(profile.aiProvider, 20);
  const deduction = str(profile.deductionMode, 20);
  return {
    profile: {
      displayName: str(profile.displayName, 80) || "My household",
      currency: str(profile.currency, 8) || "USD",
      filingStatus: FILING.has(filing) ? filing : "single",
      stateCode: str(profile.stateCode, 8),
      dependents: num(profile.dependents),
      wagesCents: num(profile.wagesCents),
      otherIncomeCents: num(profile.otherIncomeCents),
      withholdingCents: num(profile.withholdingCents),
      estimatedPaidCents: num(profile.estimatedPaidCents),
      priorYearTaxCents: num(profile.priorYearTaxCents),
      deductionMode: DEDUCTION.has(deduction) ? deduction : "auto",
      saltCapCents: num(profile.saltCapCents),
      stateRateBps: num(profile.stateRateBps),
      navHidden: str(profile.navHidden, 400),
      aiProvider: AI.has(ai) ? ai : "grok",
      openaiModel: str(profile.openaiModel, 40) || "gpt-4.1-mini",
      ollamaUrl: str(profile.ollamaUrl, 200) || "http://127.0.0.1:11434",
      ollamaModel: str(profile.ollamaModel, 40) || "llama3.1",
      vaultSalt: str(profile.vaultSalt, 200),
      vaultVerifier: str(profile.vaultVerifier, 200),
      monthStartDay: Math.min(28, Math.max(1, num(profile.monthStartDay) || 1)),
    },
    jars: ledgers.length,
    rows,
    idMap: ids,
  };
}
