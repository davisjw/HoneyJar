import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { applyAction, getWorkspace } from "@/lib/honey/fns";
import type { Action, ActionResult, LedgerBook, Workspace } from "@/lib/honey/types";

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

  useEffect(() => {
    const saved = window.localStorage.getItem("honeyjar.owner") ?? undefined;
    const owner = saved || undefined;
    setOwnerState(owner);
    setJarId(window.localStorage.getItem(jarKey(owner)) ?? undefined);
    setReady(true);
  }, []);

  const query = useQuery({
    queryKey: ["workspace", ownerId ?? "self"],
    enabled: ready,
    queryFn: () => getWorkspace({ data: { ownerId } }),
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
        setJarId(window.localStorage.getItem(jarKey(id)) ?? undefined);
      },
      busy,
      vaultKey,
      setVaultKey,
      reload: async () => {
        await qc.invalidateQueries({ queryKey: ["workspace"] });
      },
      run: async (action) => {
        setBusy(true);
        try {
          const ledgerId = action.ledgerId ?? jar?.id;
          const result = await applyAction({
            data: { ...action, ownerId: action.ownerId ?? ownerId, ...(ledgerId ? { ledgerId } : {}) },
          });
          await qc.invalidateQueries({ queryKey: ["workspace"] });
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
  }, [busy, jarId, ownerId, qc, query.data, query.error, query.isLoading, ready, vaultKey]);

  return <BookContext.Provider value={value}>{children}</BookContext.Provider>;
}

export function useBook() {
  const ctx = useContext(BookContext);
  if (!ctx) throw new Error("useBook outside provider");
  return ctx;
}
