import { CircleAlert, FileSearch, ShieldCheck, Users } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ApiError, USE_MOCKS } from "../api/client";
import { useAuth } from "../lib/auth";
import { gradient, logo } from "../theme/tokens";

const PROMISES = [
  { icon: FileSearch, text: "Every answer shows the documents it is built on." },
  { icon: ShieldCheck, text: "Every fact is checked against this client and every other client." },
  { icon: Users, text: "Every screen tells you which expert to ask." },
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
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
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
    <div className="grid min-h-screen bg-surface md:grid-cols-2">
      {/* Brand gradient panel: login screen only. The logo never sits on it (no inverse logo supplied). */}
      <section aria-label="About TrustGrid" className="relative hidden flex-col justify-between overflow-hidden p-12 md:flex" style={{ backgroundImage: gradient.brand }}>
        <div>
          <p className="font-display text-heading-xs font-bold text-navy">TrustGrid</p>
          <p className="mt-8 max-w-md font-display text-heading-xl font-bold text-navy">Find it. Understand it. Trust it.</p>
          <p className="mt-4 max-w-md text-body text-navy">One source of truth per client, checked against every client.</p>
        </div>
        <ul className="max-w-md space-y-3 rounded-lg bg-surface p-6 shadow-3">
          {PROMISES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3 text-body-s text-textStrong">
              <span aria-hidden="true" className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-iconBadge-bg text-iconBadge-fg">
                <Icon className="size-4" />
              </span>
              <span className="pt-1">{text}</span>
            </li>
          ))}
        </ul>
      </section>

      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <img src={logo.vertical.src} alt="SD Worx" width={120} height={120} className="mx-auto h-28 w-28" />
          <h1 className="mt-8 text-center text-heading-m font-bold">Log in to TrustGrid</h1>
          <p className="mt-2 text-center text-body-s text-textMuted">Use your SD Worx account.</p>

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
