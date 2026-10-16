import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  Briefcase,
  FileText,
  Flag,
  HandCoins,
  Landmark,
  LayoutDashboard,
  LineChart,
  ListChecks,
  Menu,
  PiggyBank,
  Receipt,
  Scale,
  Settings,
  Share2,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { UserButton } from "@/lib/auth/gates";
import { monthLabel, periodOf } from "@/lib/honey/calc";
import { useBook } from "./book";
import { JarMark, cn } from "./kit";

const NAV = [
  {
    group: "Money",
    items: [
      { to: "/", id: "home", label: "Spending", icon: LayoutDashboard },
      { to: "/transactions", id: "transactions", label: "Transactions", icon: ListChecks },
      { to: "/bills", id: "bills", label: "Bills", icon: Receipt },
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
    group: "Business",
    items: [{ to: "/business", id: "business", label: "Business", icon: Briefcase }],
  },
  {
    group: "Household",
    items: [
      { to: "/people", id: "people", label: "People", icon: Users },
      { to: "/documents", id: "documents", label: "Documents", icon: FileText },
      { to: "/share", id: "share", label: "Sharing", icon: Share2 },
      { to: "/accounts", id: "accounts", label: "Accounts", icon: Landmark },
      { to: "/advisor", id: "advisor", label: "Advisor", icon: Sparkles },
      { to: "/settings", id: "settings", label: "Customize", icon: Settings },
    ],
  },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data } = useBook();
  const hidden = new Set((data?.profile.navHidden ?? "").split(",").filter(Boolean));
  return (
    <div className="space-y-5">
      {NAV.map((group) => {
        const items = group.items.filter((item) => item.id === "home" || item.id === "settings" || !hidden.has(item.id));
        if (!items.length) return null;
        return (
          <div key={group.group}>
            <p className="px-3 text-xs tracking-wide text-sidebar-muted uppercase">{group.group}</p>
            <div className="mt-1 space-y-1">
              {items.map((item) => {
                const active = item.to === "/" ? path === "/" : path.startsWith(item.to);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.id}
                    to={item.to}
                    onClick={onNavigate}
                    className={cn(
                      "flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm",
                      active ? "bg-honey font-medium text-ink" : "text-sidebar-fg hover:bg-white/10",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
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

export function Shell({ children }: { children: ReactNode }) {
  const { data, loading, error, setOwnerId } = useBook();
  const [open, setOpen] = useState(false);
  const period = data ? monthLabel(periodOf(data.today, data.profile.monthStartDay)) : "";

  return (
    <div className="min-h-screen bg-paper text-ink md:grid md:grid-cols-[16.5rem_1fr]">
      <aside className="hidden bg-sidebar text-sidebar-fg md:flex md:min-h-screen md:flex-col md:p-4">
        <Link to="/" className="mb-6 flex items-center gap-2 px-2">
          <JarMark className="h-8 w-8 text-honey" />
          <span className="font-display text-2xl">HoneyJar</span>
        </Link>
        <div className="flex-1 overflow-y-auto">
          <NavLinks />
        </div>
        <div className="mt-4 border-t border-white/10 pt-3 text-sidebar-fg">
          <UserButton />
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-paper px-4 py-3 md:hidden">
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
              <div className="flex-1 overflow-y-auto">
                <NavLinks onNavigate={() => setOpen(false)} />
              </div>
              <div className="pt-3 text-sidebar-fg">
                <UserButton />
              </div>
            </div>
          </div>
        ) : null}
        <main className="mx-auto w-full max-w-6xl px-4 py-5 md:px-8 md:py-8">
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
          ) : data ? (
            <div className="space-y-4">
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
