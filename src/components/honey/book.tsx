import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { applyAction, getWorkspace } from "@/lib/honey/fns";
import type { Action, ActionResult, Workspace } from "@/lib/honey/types";

type BookValue = {
  data?: Workspace;
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

function errText(err: unknown) {
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong";
}

export function BookProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [ownerId, setOwnerState] = useState<string | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("honeyjar.owner") ?? undefined;
    setOwnerState(saved || undefined);
    setReady(true);
  }, []);

  const query = useQuery({
    queryKey: ["workspace", ownerId ?? "self"],
    enabled: ready,
    queryFn: () => getWorkspace({ data: { ownerId } }),
  });

  const value = useMemo<BookValue>(() => {
    const data = query.data;
    const role = data?.role ?? "viewer";
    return {
      data,
      loading: !ready || query.isLoading,
      error: query.error ? errText(query.error) : "",
      canEdit: role === "owner" || role === "editor",
      isOwner: role === "owner",
      ownerId,
      setOwnerId: (id) => {
        if (id) window.localStorage.setItem("honeyjar.owner", id);
        else window.localStorage.removeItem("honeyjar.owner");
        setOwnerState(id);
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
          const result = await applyAction({ data: { ...action, ownerId: action.ownerId ?? ownerId } });
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
  }, [busy, ownerId, qc, query.data, query.error, query.isLoading, ready, vaultKey]);

  return <BookContext.Provider value={value}>{children}</BookContext.Provider>;
}

export function useBook() {
  const ctx = useContext(BookContext);
  if (!ctx) throw new Error("useBook outside provider");
  return ctx;
}
