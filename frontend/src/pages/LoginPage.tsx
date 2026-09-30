import { CircleAlert, MessageSquareQuote } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ApiError, USE_MOCKS } from "../api/client";
import { useAuth } from "../lib/auth";
import { SignatureRule, TrustGridMark } from "../components/grid/TrustGridMark";
import { logo } from "../theme/tokens";

// Local demo only (fictional accounts, documented in README). Rendered in dev builds only.
const DEMO_PASSWORD = "TrustGrid-Demo-2026";
const DEMO_ACCOUNTS = [
  { email: "sofie@example.com", name: "Sofie Maes", role: "Consultant · Kaneka, CityD" },
  { email: "tomasz@example.com", name: "Tomasz Nowak", role: "Consultant · SK hi-tech" },
  { email: "lotte@example.com", name: "Lotte de Vries", role: "Team lead · all clients" },
  { email: "admin@example.com", name: "Admin", role: "All clients" },
];

export function LoginPage() {
  const { me, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as { from?: string; expired?: boolean };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(state.expired ? "Your session has ended. Log in again." : null);
  const [busy, setBusy] = useState(false);
  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();

  if (me) return <Navigate to={state.from && state.from.startsWith("/") && !state.from.startsWith("//") ? state.from : "/"} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    await doLogin(email, password);
  }

  async function doLogin(emailValue: string, passwordValue: string) {
    setBusy(true);
    setError(null);
    try {
      await login(emailValue.trim(), passwordValue.trim());
      navigate("/", { replace: true });
    } catch (err) {
      // One generic message: never reveal whether the email exists.
      setError(
        err instanceof ApiError && err.status === 429
          ? "Too many attempts. Wait a minute and try again."
          : err instanceof ApiError && err.status === 401
            ? "Email or password is incorrect"
            : "Something went wrong. Try again in a moment.",
      );
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-surface lg:grid-cols-[1.4fr_1fr]">
      {/* One-pager hero: the TrustGrid mark, the promise and the two grid dimensions. */}
      <section aria-label="About TrustGrid" className="relative flex flex-col justify-between gap-10 px-8 py-10 md:px-14 md:py-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <TrustGridMark size={64} />
            <span className="font-display text-heading-xl font-extrabold tracking-tightest text-ink">TrustGrid</span>
          </div>
          <p className="text-body-xs text-textMuted">SD Worx Hackathon · Unlock the Knowledge Within</p>
        </div>

        <div className="animate-fade-in">
          <p className="text-caption font-bold uppercase tracking-eyebrow text-hz">Find it. Understand it. Trust it.</p>
          <h1 className="mt-3 max-w-4xl font-display text-display-l font-extrabold leading-[1.02] tracking-tightest text-ink xl:text-display-xl">
            One source of truth per client, checked against every client.
          </h1>
          <p className="mt-5 max-w-2xl text-body-l text-textMuted">From “I found something” to “I understand why I can rely on it.”</p>
          <SignatureRule className="mt-6 max-w-2xl" />
        </div>

        <div className="grid max-w-4xl gap-4 md:grid-cols-3">
          <div className="rounded-3xl bg-hz-soft p-5">
            <MessageSquareQuote aria-hidden="true" className="size-6 text-hz" />
            <p className="mt-3 text-body-s font-bold leading-snug text-heading">“I found three documents. Which one do I send to the client?”</p>
          </div>
          <div className="rounded-2xl border-l-4 border-hz bg-hz-subtle p-5">
            <p className="text-caption font-bold uppercase tracking-eyebrow text-hz">↔ Horizontal</p>
            <p className="mt-1 text-body-s font-bold text-heading">The client record</p>
            <p className="mt-1 text-caption text-text">Everything about one client, each item linked to who did it.</p>
          </div>
          <div className="rounded-2xl border-l-4 border-vt bg-vt-subtle p-5">
            <p className="text-caption font-bold uppercase tracking-eyebrow text-vt">↕ Vertical</p>
            <p className="mt-1 text-body-s font-bold text-heading">Across all clients</p>
            <p className="mt-1 text-caption text-text">Same problem elsewhere: what was the solution, and who solved it?</p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-caption text-textMuted">
          <span>Built for</span>
          <img src={logo.horizontal.src} alt="SD Worx" className="h-6 w-auto" />
          <span>· makes work work</span>
        </div>
      </section>

      <main className="flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm rounded-3xl bg-surface p-8 shadow-soft">
          <TrustGridMark size={48} title="TrustGrid" />
          <h2 className="mt-5 font-display text-heading-m font-extrabold tracking-tightest text-ink">Log in to TrustGrid</h2>
          <p className="mt-1 text-body-s text-textMuted">Use your SD Worx account.</p>

          <form onSubmit={submit} className="mt-8 space-y-5" noValidate aria-describedby={error ? errorId : undefined}>
            <div>
              <label htmlFor={emailId} className="field-label">
                Email
              </label>
              <input id={emailId} type="email" autoComplete="username" required maxLength={254} className="field" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label htmlFor={passwordId} className="field-label">
                Password
              </label>
              <input id={passwordId} type="password" autoComplete="current-password" required maxLength={128} className="field" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && (
              <p id={errorId} role="alert" className="flex items-center gap-2 rounded-md border-l-4 border-danger-bold bg-danger-subtle px-3 py-2 text-body-s text-danger-text">
                <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
                {error}
              </p>
            )}
            <button type="submit" className="btn-primary w-full" disabled={busy || !email || !password}>
              {busy ? "Logging in…" : "Log in"}
            </button>
          </form>
          {import.meta.env.DEV && (
            <div className="mt-6 border-t border-border pt-5">
              <p className="text-body-xs font-semibold uppercase tracking-wide text-textMuted">Demo accounts · one click</p>
              <div className="mt-3 space-y-2">
                {DEMO_ACCOUNTS.map((a) => (
                  <button
                    key={a.email}
                    type="button"
                    className="btn-secondary w-full !justify-between text-left"
                    disabled={busy}
                    onClick={() => void doLogin(a.email, DEMO_PASSWORD)}
                  >
                    <span className="font-semibold">{a.name}</span>
                    <span className="text-body-xs font-normal text-textMuted">{a.role}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {USE_MOCKS && (
            <p className="mt-6 rounded-md bg-background px-3 py-2 text-center text-body-xs text-textMuted">
              Mock API: log in as sofie@example.com with any password.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
