import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  Boxes,
  Briefcase,
  Car,
  ChevronDown,
  Contact,
  FileText,
  Flag,
  HandCoins,
  Landmark,
  KeyRound,
  LayoutDashboard,
  LineChart,
  ListChecks,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  PiggyBank,
  Receipt,
  Scale,
  ScrollText,
  Settings,
  Share2,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { UserButton } from "@/lib/auth/gates";
import { monthLabel, periodOf } from "@/lib/honey/calc";
import { SUMMARY, useBook } from "./book";
import { JarMark, Button, Field, cn, fieldClass } from "./kit";

const NAV = [
  {
    group: "Money",
    items: [
      { to: "/", id: "home", label: "Spending", icon: LayoutDashboard },
      { to: "/transactions", id: "transactions", label: "Transactions", icon: ListChecks },
      { to: "/bills", id: "bills", label: "Bills", icon: Receipt },
      { to: "/utilities", id: "utilities", label: "Utilities", icon: Zap },
      { to: "/plan", id: "plan", label: "Spending plan", icon: Wallet },
      { to: "/cashflow", id: "cashflow", label: "Cash flow", icon: LineChart },
    ],
  },
  {
    group: "Wealth",
    items: [
      { to: "/networth", id: "networth", label: "Net worth", icon: Landmark },
      { to: "/portfolio", id: "portfolio", label: "Portfolio", icon: TrendingUp },
      { to: "/goals", id: "goals", label: "Goals", icon: PiggyBank },
      { to: "/milestones", id: "milestones", label: "Milestones", icon: Flag },
      { to: "/credit", id: "credit", label: "Credit", icon: Scale },
    ],
  },
  {
    group: "Tax & reports",
    items: [
      { to: "/reports", id: "reports", label: "Reports", icon: HandCoins },
      { to: "/taxes", id: "taxes", label: "Taxes", icon: FileText },
      { to: "/watch", id: "watch", label: "Watchlists", icon: Target },
      { to: "/reminders", id: "reminders", label: "Reminders", icon: Bell },
    ],
  },
  {
    group: "Household",
    items: [
      { to: "/people", id: "people", label: "People", icon: Users },
      { to: "/contacts", id: "contacts", label: "Contacts", icon: Contact },
      { to: "/documents", id: "documents", label: "Documents", icon: FileText },
      { to: "/share", id: "share", label: "Sharing", icon: Share2 },
      { to: "/accounts", id: "accounts", label: "Accounts", icon: Landmark },
      { to: "/advisor", id: "advisor", label: "Advisor", icon: Sparkles },
      { to: "/settings", id: "settings", label: "Customize", icon: Settings },
      { to: "/jars", id: "jars", label: "Jars", icon: Boxes },
    ],
  },
] as const;

const BUSINESS_NAV = [
  {
    group: "This jar",
    items: [{ to: "/business", id: "overview", label: "Overview", icon: Briefcase }],
  },
  {
    group: "Money",
    items: [
      { to: "/transactions", id: "transactions", label: "Transactions", icon: ListChecks },
      { to: "/invoices", id: "invoices", label: "Invoices", icon: ScrollText },
      { to: "/bills", id: "bills", label: "Bills", icon: Receipt },
      { to: "/utilities", id: "utilities", label: "Utilities", icon: Zap },
      { to: "/mileage", id: "mileage", label: "Mileage", icon: Car },
      { to: "/leases", id: "leases", label: "Leases", icon: KeyRound },
      { to: "/plan", id: "plan", label: "Spending plan", icon: Wallet },
      { to: "/cashflow", id: "cashflow", label: "Cash flow", icon: LineChart },
    ],
  },
  {
    group: "Planning",
    items: [
      { to: "/goals", id: "goals", label: "Goals", icon: PiggyBank },
      { to: "/milestones", id: "milestones", label: "Milestones", icon: Flag },
      { to: "/reports", id: "reports", label: "Reports", icon: HandCoins },
      { to: "/taxes", id: "taxes", label: "Taxes", icon: FileText },
      { to: "/watch", id: "watch", label: "Watchlists", icon: Target },
      { to: "/reminders", id: "reminders", label: "Reminders", icon: Bell },
    ],
  },
  {
    group: "Books",
    items: [
      { to: "/accounts", id: "accounts", label: "Accounts", icon: Landmark },
      { to: "/contacts", id: "contacts", label: "Contacts", icon: Contact },
      { to: "/documents", id: "documents", label: "Documents", icon: FileText },
      { to: "/jars", id: "jars", label: "Jars", icon: Boxes },
    ],
  },
] as const;

const BUSINESS_PATHS = new Set<string>(BUSINESS_NAV.flatMap((group) => group.items.map((item) => item.to)));

function NavLinks({ onNavigate, compact = false }: { onNavigate?: () => void; compact?: boolean }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data, jar, summary } = useBook();
  if (summary) {
    const active = path.startsWith("/summary");
    return (
      <div>
        {compact ? null : <p className="px-3 text-xs tracking-wide text-sidebar-muted uppercase">All jars</p>}
        <Link
          to="/summary"
          onClick={onNavigate}
          title="Summary"
          aria-label="Summary"
          className={cn(
            "mt-1 flex min-h-11 items-center gap-2 rounded-lg text-sm",
            compact ? "justify-center px-0" : "px-3",
            active ? "bg-honey font-medium text-ink" : "text-sidebar-fg hover:bg-white/10",
          )}
        >
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          {compact ? <span className="sr-only">Summary</span> : "Summary"}
        </Link>
      </div>
    );
  }
  const hidden = new Set((data?.profile.navHidden ?? "").split(",").filter(Boolean));
  const nav = jar?.kind === "business" || jar?.kind === "property" ? BUSINESS_NAV : NAV;
  return (
    <div className={compact ? "space-y-3" : "space-y-5"}>
      {nav.map((group) => {
        const items = group.items.filter((item) => {
          if (item.id === "leases" && jar?.kind !== "property") return false;
          return item.id === "home" || item.id === "settings" || item.id === "jars" || item.id === "overview" || !hidden.has(item.id);
        });
        if (!items.length) return null;
        return (
          <div key={group.group}>
            {compact ? <div className="mx-2 border-t border-white/10" /> : <p className="px-3 text-xs tracking-wide text-sidebar-muted uppercase">{group.group}</p>}
            <div className="mt-1 space-y-1">
              {items.map((item) => {
                const active = item.to === "/" ? path === "/" : path.startsWith(item.to);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.id}
                    to={item.to}
                    onClick={onNavigate}
                    title={item.label}
                    aria-label={item.label}
                    className={cn(
                      "flex min-h-11 items-center gap-2 rounded-lg text-sm",
                      compact ? "justify-center px-0" : "px-3",
                      active ? "bg-honey font-medium text-ink" : "text-sidebar-fg hover:bg-white/10",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {compact ? <span className="sr-only">{item.label}</span> : item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function JarSwitcher({ onNavigate, compact = false }: { onNavigate?: () => void; compact?: boolean }) {
  const { jar, jars, summary, setJar } = useBook();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  if (!jars.length) return null;
  const personal = jars.filter((item) => item.kind === "personal");
  const business = jars.filter((item) => item.kind === "business");
  const property = jars.filter((item) => item.kind === "property");
  const label = summary ? "All open jars" : jar?.kind === "property" ? "Property · Schedule E" : jar?.kind === "business" ? `Business · Schedule ${jar.taxForm}` : "Personal";
  const pickJar = (id: string) => {
    const next = jars.find((item) => item.id === id);
    setJar(id);
    setOpen(false);
    onNavigate?.();
    navigate({ to: next?.kind === "business" || next?.kind === "property" ? "/business" : "/" });
  };
  const pickSummary = () => {
    setJar(SUMMARY);
    setOpen(false);
    onNavigate?.();
    navigate({ to: "/summary" });
  };
  return (
    <div className="relative mb-4">
      <button
        type="button"
        className={cn("flex w-full items-center gap-2 rounded-lg py-2 text-left hover:bg-white/10", compact ? "justify-center px-0" : "justify-between px-2")}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={summary ? "All open jars" : jar?.name}
        aria-label={summary ? "All open jars" : jar?.name}
      >
        {compact ? (
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-xs font-medium">
            {(summary ? "All" : jar?.name ?? "?").slice(0, 1).toUpperCase()}
          </span>
        ) : (
          <>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{summary ? "Summary" : jar?.name}</span>
              <span className="block text-xs text-sidebar-muted">{label}</span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0" />
          </>
        )}
      </button>
      {open ? (
        <div className={cn(
          "absolute z-30 mt-1 rounded-xl border border-white/10 bg-sidebar p-1 shadow-lg",
          compact ? "top-0 left-full ml-2 max-h-[70vh] w-56 overflow-y-auto" : "left-0 right-0",
        )}>
          <div className="py-1">
            <p className="px-2 text-xs uppercase tracking-wide text-sidebar-muted">Summary</p>
            <button type="button" className={cn("block w-full rounded-lg px-2 py-2 text-left text-sm", summary ? "bg-honey text-ink" : "hover:bg-white/10")} onClick={pickSummary}>
              Summary
            </button>
          </div>
          {[{ label: "Personal", rows: personal }, { label: "Business", rows: business }, { label: "Property", rows: property }].map((group) =>
            group.rows.length ? (
              <div key={group.label} className="py-1">
                <p className="px-2 text-xs uppercase tracking-wide text-sidebar-muted">{group.label}</p>
                {group.rows.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={cn("block w-full rounded-lg px-2 py-2 text-left text-sm", !summary && item.id === jar?.id ? "bg-honey text-ink" : "hover:bg-white/10")}
                    onClick={() => pickJar(item.id)}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            ) : null,
          )}
          <Link to="/jars" className="block rounded-lg px-2 py-2 text-sm text-honey" onClick={() => { setOpen(false); onNavigate?.(); }}>
            Manage jars
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { data, jar, summary, loading, error, setOwnerId } = useBook();
  const [open, setOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const period = data ? monthLabel(periodOf(data.today, data.profile.monthStartDay)) : "";
  const home = summary ? "/summary" : jar?.kind === "business" || jar?.kind === "property" ? "/business" : "/";

  useEffect(() => {
    setCompact(window.localStorage.getItem("honeyjar.nav.compact") === "1");
  }, []);

  useEffect(() => {
    if (summary || path === "/summary") return;
    if (!jar) return;
    if ((jar.kind === "business" || jar.kind === "property") && !BUSINESS_PATHS.has(path)) navigate({ to: "/business" });
    if (jar.kind === "personal" && path === "/business") navigate({ to: "/" });
  }, [jar, navigate, path, summary]);

  const toggleCompact = () => {
    setCompact((on) => {
      const next = !on;
      window.localStorage.setItem("honeyjar.nav.compact", next ? "1" : "0");
      return next;
    });
  };

  return (
    <div className={cn("h-dvh overflow-hidden bg-paper text-ink md:grid", compact ? "md:grid-cols-[4.5rem_1fr]" : "md:grid-cols-[16.5rem_1fr]")}>
      <aside className={cn("relative z-20 hidden bg-sidebar text-sidebar-fg md:flex md:h-dvh md:flex-col", compact ? "md:overflow-visible md:p-2" : "md:overflow-hidden md:p-4")}>
        <div className={cn("mb-2 flex items-center gap-2", compact ? "flex-col" : "px-2")}>
          <Link to={home} className="flex items-center gap-2" title="HoneyJar">
            <JarMark className="h-8 w-8 shrink-0 text-honey" />
            {compact ? <span className="sr-only">HoneyJar</span> : <span className="font-display text-2xl">HoneyJar</span>}
          </Link>
          <button
            type="button"
            className={cn("inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-sidebar-fg hover:bg-white/10", compact ? "" : "ml-auto")}
            onClick={toggleCompact}
            aria-label={compact ? "Expand menu" : "Collapse menu"}
            title={compact ? "Expand menu" : "Collapse menu"}
          >
            {compact ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
        <JarSwitcher compact={compact} />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <NavLinks compact={compact} />
        </div>
        <div className={cn("mt-4 border-t border-white/10 pt-3 text-sidebar-fg", compact && "flex justify-center")}>
          <UserButton compact={compact} />
        </div>
      </aside>
      <div className="flex h-dvh min-w-0 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-paper px-4 py-3 md:hidden">
          <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu />
          </button>
          <span className="font-display text-xl">HoneyJar</span>
          <span className="w-11" />
        </header>
        {open ? (
          <div className="fixed inset-0 z-30 md:hidden">
            <button className="absolute inset-0 bg-sidebar/50" aria-label="Close menu" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-sidebar p-4 text-sidebar-fg">
              <div className="mb-4 flex items-center justify-between">
                <span className="font-display text-2xl">HoneyJar</span>
                <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center" onClick={() => setOpen(false)} aria-label="Close">
                  <X />
                </button>
              </div>
              <JarSwitcher onNavigate={() => setOpen(false)} />
              <div className="flex-1 overflow-y-auto">
                <NavLinks onNavigate={() => setOpen(false)} />
              </div>
              <div className="pt-3 text-sidebar-fg">
                <UserButton />
              </div>
            </div>
          </div>
        ) : null}
        <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-4 py-5 md:px-8 md:py-8">
          {loading ? (
            <div className="space-y-3">
              <div className="h-8 w-48 rounded-lg bg-honey-soft" />
              <div className="h-32 rounded-2xl bg-card" />
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-line bg-card p-5">
              <p className="font-medium">Couldn’t open this household</p>
              <p className="mt-1 text-sm text-muted">{error}</p>
              <button type="button" className="mt-3 text-sm text-honey-deep underline" onClick={() => setOwnerId(undefined)}>
                Back to my household
              </button>
            </div>
          ) : data && !data.profile.initialized && data.role === "owner" ? (
            <NameHousehold />
          ) : data ? (
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
              {data.profile.seeded ? (
                <p className="rounded-xl bg-honey-soft px-3 py-2 text-sm text-ink">
                  Sample household for {period}. Change anything — or clear it in Customize when you want your own books.
                </p>
              ) : null}
              {data.role !== "owner" ? (
                <p className="rounded-xl border border-line bg-card px-3 py-2 text-sm">
                  Viewing {data.profile.displayName} · {data.role === "editor" ? "you can edit" : "view only"}
                  <button type="button" className="ml-3 text-honey-deep underline" onClick={() => setOwnerId(undefined)}>
                    My household
                  </button>
                </p>
              ) : null}
              {children}
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}

export const NAV_IDS = NAV.flatMap((g) => g.items.map((i) => ({ id: i.id, label: i.label })));

function NameHousehold() {
  const { run } = useBook();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  return (
    <form
      className="mx-auto w-full max-w-md space-y-3 rounded-2xl border border-line bg-card p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        try {
          await run({ type: "household.begin", name });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not create the household");
        }
      }}
    >
      <h1 className="font-display text-2xl">Name this household</h1>
      <p className="text-sm text-muted">This starts blank. Nothing from the sample household is loaded. You can load that later from Customize.</p>
      <Field label="Household name">
        <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" autoFocus />
      </Field>
      {error ? <p className="text-sm text-clay">{error}</p> : null}
      <Button type="submit">Create</Button>
    </form>
  );
}
