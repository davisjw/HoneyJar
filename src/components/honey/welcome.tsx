import { useEffect, useState } from "react";
import { GROK_PROVIDERS, authClient, signIn } from "@/lib/auth/client";
import { getSignInOptions } from "@/lib/auth/sign-in-options";
import { redeemRecoveryCode } from "@/lib/honey/fns";
import { JarMark } from "./kit";

export function Boot() {
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-6 text-ink">
      <div className="text-center">
        <JarMark className="mx-auto h-12 w-12 text-honey-deep" />
        <p className="mt-3 font-display text-3xl">HoneyJar</p>
        <p className="mt-1 text-sm text-muted">Opening your books</p>
      </div>
    </main>
  );
}

export function Welcome() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [oauth, setOauth] = useState(false);
  const [emailReset, setEmailReset] = useState(false);
  const [help, setHelp] = useState<"code" | "mail" | null>(null);
  const [code, setCode] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [resetToken, setResetToken] = useState("");

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token") ?? "";
    if (token) setResetToken(token);
    void getSignInOptions()
      .then((opts) => {
        setOauth(opts.oauth);
        setEmailReset(opts.emailReset);
      })
      .catch(() => {
        setOauth(false);
        setEmailReset(false);
      });
  }, []);

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      const result =
        mode === "up"
          ? await authClient.signUp.email({ email, password, name: name || "Household" })
          : await authClient.signIn.email({ email, password });
      if (result.error) throw new Error(result.error.message || "Sign-in failed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="min-h-screen bg-paper text-ink md:grid md:grid-cols-2">
      <section className="flex flex-col justify-between bg-sidebar px-6 py-8 text-sidebar-fg md:px-10">
        <div className="flex items-center gap-2 text-honey">
          <JarMark className="h-9 w-9" />
          <span className="font-display text-2xl text-sidebar-fg">HoneyJar</span>
        </div>
        <div className="my-10 max-w-md">
          <h1 className="font-display text-4xl leading-tight">The household books, in one jar.</h1>
          <p className="mt-4 text-pretty text-sidebar-muted">
            Spending, bills, cash a year out, net worth, and taxes. Tune every category, rule, and report.
            Share a view with a partner or advisor when you want a second set of eyes.
          </p>
        </div>
        <p className="text-sm text-sidebar-muted">Personal books first. Investments and business jars come next.</p>
      </section>
      <section className="flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm space-y-3">
          <h2 className="font-display text-3xl">{mode === "up" ? "Create your jar" : "Open your jar"}</h2>
          <p className="text-sm text-muted">The first sign-in loads a sample household you can edit or clear.</p>
          <form className="space-y-2" onSubmit={submitEmail}>
            {mode === "up" ? (
              <input className="min-h-11 w-full rounded-lg border border-line bg-card px-3" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
            ) : null}
            <input className="min-h-11 w-full rounded-lg border border-line bg-card px-3" type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            <input className="min-h-11 w-full rounded-lg border border-line bg-card px-3" type="password" required minLength={8} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "up" ? "new-password" : "current-password"} />
            {error ? <p className="text-sm text-clay">{error}</p> : null}
            <button type="submit" disabled={pending} className="min-h-11 w-full rounded-lg bg-honey font-medium text-ink disabled:opacity-60">
              {pending ? "Working…" : mode === "up" ? "Create account" : "Sign in"}
            </button>
          </form>
          <button type="button" className="text-sm text-honey-deep underline" onClick={() => setMode(mode === "up" ? "in" : "up")}>
            {mode === "up" ? "Already have an account" : "Need an account"}
          </button>
          {resetToken ? (
            <form
              className="space-y-2"
              onSubmit={async (e) => {
                e.preventDefault();
                setError("");
                setPending(true);
                try {
                  const result = await authClient.resetPassword({ newPassword: nextPassword, token: resetToken });
                  if (result.error) throw new Error(result.error.message || "Could not reset the password");
                  setNotice("Password updated. Sign in with it.");
                  setResetToken("");
                  window.history.replaceState({}, "", "/login");
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Could not reset the password");
                } finally {
                  setPending(false);
                }
              }}
            >
              <input className="min-h-11 w-full rounded-lg border border-line bg-card px-3" type="password" required minLength={8} placeholder="New password" value={nextPassword} onChange={(e) => setNextPassword(e.target.value)} autoComplete="new-password" />
              <button type="submit" disabled={pending} className="min-h-11 w-full rounded-lg bg-honey font-medium text-ink">Save new password</button>
            </form>
          ) : null}
          {help === "code" ? (
            <form
              className="space-y-2"
              onSubmit={async (e) => {
                e.preventDefault();
                setError("");
                setPending(true);
                try {
                  await redeemRecoveryCode({ data: { email, code, newPassword: nextPassword } });
                  setNotice("Password updated. Sign in with it.");
                  setHelp(null);
                  setCode("");
                  setNextPassword("");
                } catch (err) {
                  setError(err instanceof Error ? err.message : "That recovery code does not match.");
                } finally {
                  setPending(false);
                }
              }}
            >
              <input className="min-h-11 w-full rounded-lg border border-line bg-card px-3" placeholder="Recovery code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" />
              <input className="min-h-11 w-full rounded-lg border border-line bg-card px-3" type="password" required minLength={8} placeholder="New password" value={nextPassword} onChange={(e) => setNextPassword(e.target.value)} autoComplete="new-password" />
              <button type="submit" disabled={pending} className="min-h-11 w-full rounded-lg border border-line bg-card text-sm">Set password</button>
            </form>
          ) : null}
          {help === "mail" ? (
            <button
              type="button"
              className="min-h-11 w-full rounded-lg border border-line bg-card text-sm"
              onClick={async () => {
                setError("");
                setPending(true);
                try {
                  const result = await authClient.requestPasswordReset({ email, redirectTo: `${window.location.origin}/login` });
                  if (result.error) throw new Error(result.error.message || "Could not send the reset link");
                  setNotice("If that email has an account, a reset link is on its way.");
                  setHelp(null);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Could not send the reset link");
                } finally {
                  setPending(false);
                }
              }}
            >
              Email a reset link
            </button>
          ) : null}
          {notice ? <p className="text-sm text-muted">{notice}</p> : null}
          <div className="flex flex-wrap gap-3 text-sm">
            <button type="button" className="text-honey-deep underline" onClick={() => setHelp(help === "code" ? null : "code")}>Use a recovery code</button>
            {emailReset ? <button type="button" className="text-honey-deep underline" onClick={() => setHelp(help === "mail" ? null : "mail")}>Email a reset link</button> : null}
          </div>
          {oauth ? (
            <div className="space-y-2 pt-2">
              {GROK_PROVIDERS.map((p) => (
                <button
                  key={p.providerId}
                  type="button"
                  onClick={() => signIn(p.providerId, { callbackURL: "/" })}
                  className="min-h-11 w-full rounded-lg border border-line bg-card text-sm"
                >
                  Continue with {p.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
