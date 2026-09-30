import { ChevronDown, LogOut } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Link, Outlet, useMatch, useNavigate } from "react-router-dom";
import { api, USE_MOCKS } from "../api/client";
import { logo } from "../theme/tokens";
import { useAuth } from "../lib/auth";
import { ClientsContext, useClients } from "../lib/clients";
import { initials, sentenceCase } from "../lib/format";
import { useAsync } from "../lib/useAsync";

function ClientSwitcher() {
  const { clients } = useClients();
  const match = useMatch("/clients/:clientId/*");
  const navigate = useNavigate();
  const id = useId();
  const current = match?.params.clientId ?? "";
  if (clients.length === 0) return null;
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="hidden text-body-xs font-semibold text-textMuted lg:block">
        Client
      </label>
      <select
        id={id}
        className="field max-w-[15rem] py-1.5 sm:max-w-[18rem]"
        value={current}
        onChange={(e) => e.target.value && navigate(`/clients/${encodeURIComponent(e.target.value)}`)}
      >
        <option value="" disabled>
          Choose a client
        </option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function UserMenu() {
  const { me, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!me) return null;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="flex items-center gap-2 rounded px-1 py-1 hover:bg-background"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true" className="inline-flex size-9 items-center justify-center rounded-full bg-primaryTint font-display text-body-xs font-bold text-navy">
          {initials(me.person.name)}
        </span>
        <span className="hidden text-left md:block">
          <span className="block text-body-xs font-semibold text-textStrong">{me.person.name}</span>
          <span className="block text-caption text-textMuted">{sentenceCase(me.role)}</span>
        </span>
        <ChevronDown aria-hidden="true" className="size-4 text-iconMuted" />
        <span className="sr-only">Account menu</span>
      </button>
      {open && (
        <div id={menuId} className="absolute right-0 z-40 mt-2 w-64 rounded-lg border border-borderSubtle bg-surface p-2 shadow-4">
          <div className="px-3 py-2">
            <p className="text-body-s font-semibold text-textStrong">{me.person.name}</p>
            <p className="text-body-xs text-textMuted">
              {me.person.role} · {me.person.team}
            </p>
          </div>
          <hr className="my-1 border-borderSubtle" />
          <button type="button" className="btn-ghost w-full justify-start" onClick={() => void logout()}>
            <LogOut aria-hidden="true" className="size-4" />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

export function AppShell() {
  const clientsState = useAsync(() => api.clients(), []);
  return (
    <ClientsContext.Provider value={{ clients: clientsState.data ?? [], reload: clientsState.reload }}>
      <a href="#main" className="sr-only z-50 rounded bg-surface px-4 py-2 focus:not-sr-only focus:absolute focus:left-4 focus:top-4">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 h-header border-b border-borderSubtle bg-surface">
        <div className="mx-auto flex h-full max-w-content items-center gap-4 px-6">
          <Link to="/" className="flex shrink-0 items-center gap-4 rounded py-2" aria-label="TrustGrid home">
            {/* Clear space: ≥ the x-height of the wordmark on every side (padding + gap). */}
            <img src={logo.horizontal.src} alt="SD Worx" className="h-8 w-auto" width={93} height={32} />
            <span aria-hidden="true" className="h-6 w-px bg-border" />
            <span className="font-display text-heading-xxs font-bold text-heading">TrustGrid</span>
          </Link>
          {USE_MOCKS && (
            <span className="hidden rounded-full border border-border px-2 py-0.5 text-caption font-semibold text-textMuted xl:inline">
              Mock API
            </span>
          )}
          <div className="ml-auto flex items-center gap-3 sm:gap-5">
            <ClientSwitcher />
            <UserMenu />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-content px-6 pb-16 pt-8">
        <Outlet />
      </main>
    </ClientsContext.Provider>
  );
}
