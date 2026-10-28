import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { applyAction, getWorkspace, noteSignIn } from "@/lib/honey/fns";
import { addMonths, annotateJar } from "@/lib/honey/calc";
import type { Account, Action, ActionResult, LedgerBook, Rule, Txn, Workspace } from "@/lib/honey/types";

type BookValue = {
  data?: Workspace;
  jar?: LedgerBook;
  jars: LedgerBook[];
  summary: boolean;
  setJar: (id: string) => void;
  loading: boolean;
  error: string;
  canEdit: boolean;
  isOwner: boolean;
  ownerId?: string;
  setOwnerId: (id?: string) => void;
  run: (action: Action) => Promise<ActionResult>;
  busy: boolean;
  vaultKey: CryptoKey | null;
  setVaultKey: (key: CryptoKey | null) => void;
  reload: () => Promise<void>;
  showEarlier: () => void;
  loadingEarlier: boolean;
  txnSince?: string;
};

const BookContext = createContext<BookValue | null>(null);

export const SUMMARY = "summary";

function errText(err: unknown) {
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong";
}

function jarKey(ownerId?: string) {
  return `honeyjar.jar.${ownerId ?? "self"}`;
}

function upsertTxn(list: Txn[], txn: Txn): Txn[] {
  return [...list.filter((item) => item.id !== txn.id), txn].sort((a, b) => b.postedOn.localeCompare(a.postedOn) || a.merchant.localeCompare(b.merchant));
}

function mergeById<T extends { id: string }>(list: T[], next: T[] | undefined): T[] {
  if (!next?.length) return list;
  const map = new Map(list.map((item) => [item.id, item]));
  for (const item of next) map.set(item.id, item);
  return list.map((item) => map.get(item.id) ?? item).concat(next.filter((item) => !list.some((old) => old.id === item.id)));
}

function replaceAccounts(list: Account[], next: Account[] | undefined): Account[] {
  if (!next?.length) return list;
  const mine = next.filter((account) => list.some((old) => old.id === account.id));
  if (!mine.length) return list;
  const map = new Map(mine.map((account) => [account.id, account]));
  return list.map((account) => map.get(account.id) ?? account);
}

function mergeRules(rules: Rule[], incoming?: Rule[], deleted?: string[]): Rule[] {
  if (!incoming?.length && !deleted?.length) return rules;
  const removed = new Set(deleted ?? []);
  let next = removed.size ? rules.filter((rule) => !removed.has(rule.id)) : rules.slice();
  for (const rule of incoming ?? []) {
    const index = next.findIndex((item) => item.id === rule.id);
    if (index >= 0) next[index] = rule;
    else next = [...next, rule];
  }
  return next;
}

function applyPatch(ws: Workspace, patch: NonNullable<ActionResult["patch"]>, focusId?: string): Workspace {
  const removed = new Set(patch.deletedTransactionIds ?? []);
  const personalId = ws.ledgers.find((book) => book.kind === "personal" && !book.archived)?.id ?? ws.ledgers.find((book) => book.kind === "personal")?.id;
  const ruleTarget = focusId || personalId;
  const ledgers = ws.ledgers.map((book) => {
    const rules = book.id === ruleTarget ? mergeRules(book.rules, patch.rules, patch.deletedRuleIds) : book.rules;
    const accounts = replaceAccounts(book.accounts, patch.accounts);
    const readings = mergeById(
      book.readings,
      patch.readings?.filter((reading) => book.meters.some((meter) => meter.id === reading.meterId)),
    );
    let transactions = book.transactions.filter((txn) => !removed.has(txn.id));
    let touched = transactions.length !== book.transactions.length || accounts !== book.accounts || readings !== book.readings;
    for (const txn of patch.transactions ?? []) {
      const owns = accounts.some((account) => account.id === txn.accountId);
      const had = book.transactions.some((item) => item.id === txn.id);
      if (!owns && !had) continue;
      touched = true;
      transactions = owns ? upsertTxn(transactions, txn) : transactions.filter((item) => item.id !== txn.id);
    }
    if (!touched && rules === book.rules) return book;
    if (!touched) return { ...book, rules };
    const loaded = book.transactions.length > 0 || book.id === focusId;
    if (!loaded) return { ...book, accounts, readings, rules };
    return annotateJar({ ...book, accounts, readings, transactions, rules }, ws.today, ws.profile.monthStartDay);
  });
  const primary = ledgers.find((book) => book.kind === "personal" && !book.archived) ?? ledgers.find((book) => book.kind === "personal");
  return {
    ...ws,
    ledgers,
    rules: primary?.rules ?? ws.rules,
    accounts: replaceAccounts(ws.accounts, patch.accounts),
    readings: mergeById(ws.readings, patch.readings),
  };
}

function scopeJar(data: Workspace, jar: LedgerBook): Workspace {
  const billIds = new Set(jar.bills.map((b) => b.id));
  return {
    ...data,
    accounts: jar.accounts,
    categories: jar.categories,
    transactions: jar.transactions,
    bills: jar.bills,
    rules: jar.rules,
    plan: jar.plan,
    goals: jar.goals,
    milestones: jar.milestones,
    watches: jar.watches,
    reminders: jar.reminders,
    documents: jar.documents,
    reports: jar.reports,
    payments: data.payments.filter((p) => billIds.has(p.billId)),
    meters: jar.meters,
    columns: jar.columns,
    readings: jar.readings,
  };
}

export function BookProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [ownerId, setOwnerState] = useState<string | undefined>(undefined);
  const [jarId, setJarId] = useState<string | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);
  const [txnSince, setTxnSince] = useState<string | undefined>(undefined);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const sawEarlierFetch = useRef(false);
  const user = useCurrentUser();

  useEffect(() => {
    if (!user || user.isDevFallback) return;
    const key = `hj-signin-${user.id}`;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "1");
    void noteSignIn().catch(() => window.sessionStorage.removeItem(key));
  }, [user]);

  useEffect(() => {
    const saved = window.localStorage.getItem("honeyjar.owner") ?? undefined;
    const owner = saved || undefined;
    setOwnerState(owner);
    setJarId(window.localStorage.getItem(jarKey(owner)) ?? undefined);
    setReady(true);
  }, []);

  const query = useQuery({
    queryKey: ["workspace", ownerId ?? "self", jarId ?? "home", txnSince ?? "recent"],
    enabled: ready,
    placeholderData: (previousData, previousQuery) => {
      const prev = previousQuery?.queryKey;
      if (!previousData || !Array.isArray(prev)) return undefined;
      if (prev[1] === (ownerId ?? "self") && prev[2] === (jarId ?? "home")) return previousData;
      return undefined;
    },
    queryFn: () =>
      getWorkspace({
        data: {
          ownerId,
          ledgerId: jarId && jarId !== SUMMARY ? jarId : undefined,
          txnSince,
          window: true,
        },
      }),
  });

  const value = useMemo<BookValue>(() => {
    const raw = query.data;
    const open = raw?.ledgers.filter((l) => !l.archived) ?? [];
    const summary = jarId === SUMMARY;
    const jar = summary ? undefined : open.find((l) => l.id === jarId) ?? open.find((l) => l.kind === "personal") ?? open[0];
    const data = raw && jar ? scopeJar(raw, jar) : raw;
    const role = raw?.role ?? "viewer";
    return {
      data,
      jar,
      jars: open,
      summary,
      setJar: (id) => {
        window.localStorage.setItem(jarKey(ownerId), id);
        setTxnSince(undefined);
        setJarId(id);
      },
      loading: !ready || query.isLoading,
      error: query.error ? errText(query.error) : "",
      canEdit: role === "owner" || role === "editor",
      isOwner: role === "owner",
      ownerId,
      setOwnerId: (id) => {
        if (id) window.localStorage.setItem("honeyjar.owner", id);
        else window.localStorage.removeItem("honeyjar.owner");
        setOwnerState(id);
        setTxnSince(undefined);
        setJarId(window.localStorage.getItem(jarKey(id)) ?? undefined);
      },
      busy,
      vaultKey,
      setVaultKey,
      reload: async () => {
        await qc.invalidateQueries({ queryKey: ["workspace"] });
      },
      txnSince,
      loadingEarlier,
      showEarlier: () => {
        if (loadingEarlier) return;
        const oldest = jar?.transactions.reduce((min, txn) => (!min || txn.postedOn < min ? txn.postedOn : min), "");
        if (!oldest) return;
        const next = addMonths(oldest, -24);
        if (next === txnSince) return;
        setLoadingEarlier(true);
        setTxnSince(next);
      },
      run: async (action) => {
        setBusy(true);
        try {
          const ledgerId = action.ledgerId ?? jar?.id;
          const result = await applyAction({
            data: { ...action, ownerId: action.ownerId ?? ownerId, ...(ledgerId ? { ledgerId } : {}) },
          });
          const key = ["workspace", ownerId ?? "self", jarId ?? "home", txnSince ?? "recent"] as const;
          if (result.patch) qc.setQueryData<Workspace>(key, (current) => (current ? applyPatch(current, result.patch!, jar?.id) : current));
          else await qc.invalidateQueries({ queryKey: ["workspace"] });
          return result;
        } catch (err) {
          const message = errText(err);
          toast.error(message);
          throw err;
        } finally {
          setBusy(false);
        }
      },
    };
  }, [busy, jarId, ownerId, qc, query.data, query.error, query.isLoading, ready, txnSince, vaultKey, loadingEarlier]);

  useEffect(() => {
    if (!loadingEarlier) {
      sawEarlierFetch.current = false;
      return;
    }
    if (query.isFetching) sawEarlierFetch.current = true;
    else if (sawEarlierFetch.current) setLoadingEarlier(false);
  }, [loadingEarlier, query.isFetching]);

  return <BookContext.Provider value={value}>{children}</BookContext.Provider>;
}

export function useBook() {
  const ctx = useContext(BookContext);
  if (!ctx) throw new Error("useBook outside provider");
  return ctx;
}
