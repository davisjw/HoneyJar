import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { money, signedMoney } from "@/lib/honey/calc";

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/** Sticky header and first column for a table that scrolls inside itself. */
export function pinCell(first: boolean, head: boolean, hot = false) {
  const bg = hot ? "bg-honey-soft" : "bg-card";
  if (first && head) return `sticky left-0 top-0 z-30 border-r border-line ${bg}`;
  if (head) return `sticky top-0 z-20 ${bg}`;
  if (first) return `sticky left-0 z-10 border-r border-line ${bg}`;
  return "";
}

export function JarMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect x="16" y="6" width="16" height="6" rx="2" fill="currentColor" />
      <path
        d="M14 16h20l2 4v18a6 6 0 0 1-6 6H18a6 6 0 0 1-6-6V20l2-4z"
        fill="currentColor"
        opacity="0.9"
      />
      <path d="M16 28h16" stroke="#f3eee4" strokeWidth="2" />
    </svg>
  );
}

export function Button({
  children,
  onClick,
  type = "button",
  tone = "primary",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  tone?: "primary" | "quiet" | "ghost" | "danger";
  disabled?: boolean;
}) {
  const toneClass = {
    primary: "bg-honey text-ink hover:bg-honey-deep hover:text-paper",
    quiet: "border border-line bg-card text-ink hover:bg-honey-soft",
    ghost: "text-ink hover:bg-honey-soft",
    danger: "bg-clay-soft text-clay hover:bg-clay hover:text-paper",
  }[tone];
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition disabled:opacity-50",
        toneClass,
      )}
    >
      {children}
    </button>
  );
}

export const fieldClass =
  "min-h-11 w-full rounded-lg border border-line bg-card px-3 text-base text-ink outline-none focus:border-honey";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-muted">{label}</span>
      {children}
    </label>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-sidebar/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-line bg-card p-5 shadow-xl">
          <Dialog.Title className="font-display text-2xl text-ink">{title}</Dialog.Title>
          <div className="mt-4 space-y-3">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function PageIntro({ title, lede, action }: { title: string; lede?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex shrink-0 flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-3xl text-ink">{title}</h1>
        {lede ? <p className="mt-1 max-w-2xl text-pretty text-muted">{lede}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-2xl border border-line bg-card p-4", className)}>{children}</section>;
}

export function MoneyText({
  cents,
  currency,
  signed,
}: {
  cents: number;
  currency?: string;
  signed?: boolean;
}) {
  const tone = cents > 0 ? "text-sage" : cents < 0 ? "text-clay" : "text-ink";
  return <span className={cn("num", signed ? tone : "text-ink")}>{signed ? signedMoney(cents, currency) : money(cents, currency)}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-paper px-3 py-6 text-center text-sm text-muted">{children}</p>;
}

export function downloadText(filename: string, text: string, type = "application/json") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
