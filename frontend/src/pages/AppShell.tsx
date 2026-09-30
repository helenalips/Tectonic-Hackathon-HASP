import { Building2, ChevronDown, FlaskConical, LogOut, Mail, Search, Sparkles, Users, type LucideIcon } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api, onPreviewChange, USE_MOCKS } from "../api/client";
import { TrustGridLogo } from "../components/grid/TrustGridMark";
import { Avatar } from "../components/profile/Avatar";
import { useAuth } from "../lib/auth";
import { ClientsContext } from "../lib/clients";
import { sentenceCase } from "../lib/format";
import { useAsync } from "../lib/useAsync";

const NAV: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: "/", label: "Ask", icon: Sparkles, end: true },
  { to: "/inbox", label: "Outlook", icon: Mail },
  { to: "/clients", label: "Clients", icon: Building2 },
  { to: "/people", label: "People", icon: Users },
];

/** Event the chat page listens to: focus the composer (optionally with a question). */
export const ASK_EVENT = "trustgrid:ask";

function Rail() {
  return (
    <nav aria-label="Main" className="sticky top-topbar hidden h-[calc(100vh-56px)] w-rail shrink-0 flex-col items-center gap-1 border-r border-borderSubtle bg-surface py-3 sm:flex">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `group flex w-16 flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-semibold transition-colors duration-fast ${
              isActive ? "bg-hz-soft text-hz" : "text-textMuted hover:bg-background hover:text-textStrong"
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span className={`inline-flex size-8 items-center justify-center rounded-lg ${isActive ? "bg-surface shadow-0" : ""}`}>
                <Icon aria-hidden="true" className="size-[18px]" strokeWidth={isActive ? 2.4 : 2} />
              </span>
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function AskBox() {
  const navigate = useNavigate();
  const location = useLocation();
  const [q, setQ] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (location.pathname === "/") window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail: {} }));
        else ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [location.pathname]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const question = q.trim();
    if (!question) return;
    setQ("");
    ref.current?.blur();
    if (location.pathname === "/") window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail: { q: question } }));
    else navigate("/", { state: { q: question } });
  }

  return (
    <form role="search" onSubmit={submit} className="relative w-full max-w-xl">
      <label htmlFor={id} className="sr-only">
        Ask TrustGrid
      </label>
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-iconMuted" />
      <input
        ref={ref}
        id={id}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Ask TrustGrid about any client…"
        autoComplete="off"
        className="h-10 w-full rounded-xl border border-borderSubtle bg-background pl-9 pr-16 text-body-xs text-textStrong placeholder:text-textMuted transition-colors focus:border-hz focus:bg-surface"
      />
      <span className="pointer-events-none absolute right-2.5 top-1/2 flex -translate-y-1/2 gap-1" aria-hidden="true">
        <kbd className="kbd">⌘</kbd>
        <kbd className="kbd">K</kbd>
      </span>
    </form>
  );
}

function UserMenu() {
  const { me, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
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
      <button type="button" className="flex items-center gap-2 rounded-xl px-1.5 py-1 hover:bg-background" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen((v) => !v)}>
        <Avatar name={me.person.name} seed={me.person.id} size="sm" />
        <span className="hidden text-left lg:block">
          <span className="block text-caption font-bold text-textStrong">{me.person.name}</span>
          <span className="block text-[11px] text-textMuted">{sentenceCase(me.role)}</span>
        </span>
        <ChevronDown aria-hidden="true" className="size-4 text-iconMuted" />
        <span className="sr-only">Account menu</span>
      </button>
      {open && (
        <div id={menuId} className="animate-pop absolute right-0 z-40 mt-2 w-64 rounded-xl border border-borderSubtle bg-surface p-2 shadow-pop">
          <div className="px-3 py-2">
            <p className="text-body-xs font-bold text-textStrong">{me.person.name}</p>
            <p className="text-caption text-textMuted">
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

function PreviewBadge() {
  const [on, setOn] = useState(USE_MOCKS);
  useEffect(() => onPreviewChange(setOn), []);
  if (!on) return null;
  return (
    <span
      className="hidden items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-textMuted md:inline-flex"
      title="Some results come from the built-in preview engine because the backend endpoint is not available yet."
    >
      <FlaskConical aria-hidden="true" className="size-3.5" /> Preview data
    </span>
  );
}

export function AppShell() {
  const clientsState = useAsync(() => api.clients(), []);
  return (
    <ClientsContext.Provider value={{ clients: clientsState.data ?? [], reload: clientsState.reload }}>
      <a href="#main" className="sr-only z-50 rounded bg-surface px-4 py-2 focus:not-sr-only focus:absolute focus:left-4 focus:top-4">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 h-topbar border-b border-borderSubtle bg-surface/85 backdrop-blur-md">
        <div className="flex h-full items-center gap-4 px-4">
          <Link to="/" className="flex shrink-0 items-center rounded-lg py-1 pr-2" aria-label="TrustGrid home">
            <TrustGridLogo size={26} />
          </Link>
          <div className="flex flex-1 justify-center">
            <AskBox />
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <PreviewBadge />
            <span className="hidden text-[11px] font-medium text-textMuted min-[1360px]:inline">SD Worx Hackathon · Unlock the Knowledge Within</span>
            <UserMenu />
          </div>
        </div>
      </header>
      <div className="flex min-h-[calc(100vh-56px)]">
        <Rail />
        <main id="main" className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </ClientsContext.Provider>
  );
}
