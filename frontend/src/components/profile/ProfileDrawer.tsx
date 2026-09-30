import {
  ArrowDown,
  ArrowRight,
  BadgeCheck,
  Briefcase,
  FileText,
  Languages,
  Mail,
  MapPin,
  MessageSquare,
  X,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { errorMessage } from "../../api/client";
import { getPersonProfile, isValidEmail, type PersonProfileV2 } from "../../api/people";
import type { PersonRef } from "../../api/types";
import { useAsync } from "../../lib/useAsync";
import { CATEGORY_LABEL, formatDate, formatHours } from "../../lib/format";
import { ErrorState } from "../States";
import { TrustBadge } from "../TrustBadge";
import { Avatar } from "./Avatar";
import { ReliabilityRing } from "./ReliabilityRing";

// ------------------------------------------------------------------ context

interface ProfileDrawerApi {
  open: (personId: string) => void;
  close: () => void;
}

const noop: ProfileDrawerApi = { open: () => undefined, close: () => undefined };
const ProfileDrawerContext = createContext<ProfileDrawerApi | null>(null);

/** Opens/closes the person profile drawer. Without a provider this is a harmless no-op. */
export function useProfileDrawer(): ProfileDrawerApi {
  return useContext(ProfileDrawerContext) ?? noop;
}

const ANIMATION_MS = 200;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Wrap the app (inside the router) once. Renders the drawer in a portal on document.body. */
export function ProfileDrawerProvider({ children }: { children: ReactNode }) {
  const [personId, setPersonId] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const open = useCallback((id: string) => {
    window.clearTimeout(timer.current);
    if (!returnFocus.current && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
      returnFocus.current = document.activeElement;
    }
    setPersonId(id);
    // Next frame so the panel mounts off-screen first and slides in.
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const close = useCallback(() => {
    setVisible(false);
    const finish = () => {
      setPersonId(null);
      const el = returnFocus.current;
      returnFocus.current = null;
      if (el && el.isConnected) el.focus();
    };
    window.clearTimeout(timer.current);
    if (prefersReducedMotion()) finish();
    else timer.current = window.setTimeout(finish, ANIMATION_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const api = useMemo(() => ({ open, close }), [open, close]);
  return (
    <ProfileDrawerContext.Provider value={api}>
      {children}
      {personId && createPortal(<ProfileDrawer personId={personId} visible={visible} onClose={close} />, document.body)}
    </ProfileDrawerContext.Provider>
  );
}

// ------------------------------------------------------------------ drawer shell

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function ProfileDrawer({ personId, visible, onClose }: { personId: string; visible: boolean; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const { data, error, loading, reload } = useAsync(() => getPersonProfile(personId), [personId]);

  useEffect(() => {
    closeBtn.current?.focus();
  }, [personId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const trapTab = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !panel.current) return;
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !panel.current.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const ready = data && !loading && data.person.id === personId;

  return (
    <div className="fixed inset-0 z-50">
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`absolute inset-0 bg-navy/30 transition-opacity duration-200 motion-reduce:transition-none ${visible ? "opacity-100" : "opacity-0"}`}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ready ? titleId : undefined}
        aria-label={ready ? undefined : "Person profile"}
        aria-busy={loading}
        onKeyDown={trapTab}
        className={`absolute inset-y-0 right-0 flex w-full max-w-[480px] flex-col bg-surface shadow-4 transition-transform duration-200 ease-out motion-reduce:transition-none ${visible ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center justify-between border-b border-borderSubtle px-6 py-3">
          <span className="eyebrow">Person profile</span>
          <button ref={closeBtn} type="button" onClick={onClose} className="btn-ghost min-h-9 px-2" aria-label="Close profile">
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-6">
          {error ? (
            <ErrorState message={errorMessage(error)} onRetry={reload} />
          ) : ready ? (
            <ProfileBody profile={data} titleId={titleId} />
          ) : (
            <ProfileSkeleton />
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ content

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function monthYear(iso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  if (!m) return "";
  return `${MONTHS[Number(m[2]) - 1] ?? ""} ${m[1]}`;
}

function Section({ title, children, icon }: { title: string; children: ReactNode; icon?: ReactNode }) {
  return (
    <section className="mt-8">
      <h3 className="mb-3 flex items-center gap-2 text-heading-xxs font-bold">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function Lane({ dimension, title, summary, children }: { dimension: "horizontal" | "vertical"; title: string; summary: string; children: ReactNode }) {
  const h = dimension === "horizontal";
  const Icon = h ? ArrowRight : ArrowDown;
  return (
    <section className={`mt-8 rounded-lg border border-borderSubtle border-l-4 ${h ? "border-l-primary" : "border-l-secondary"} bg-surface p-4`}>
      <p className={`flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wide ${h ? "text-primaryPressed" : "text-secondary"}`}>
        <Icon aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
        {h ? "Horizontal · This client's record" : "Vertical · Across clients"}
      </p>
      <h3 className="mt-1 text-heading-xxs font-bold">{title}</h3>
      <p className="mb-3 text-body-xs text-textMuted">{summary}</p>
      {children}
    </section>
  );
}

function ProfileBody({ profile: p, titleId }: { profile: PersonProfileV2; titleId: string }) {
  const [slackNote, setSlackNote] = useState(false);
  const maxHours = Math.max(1, ...p.contributions.map((c) => c.hours));
  const totalHours = p.total_hours || p.contributions.reduce((s, c) => s + c.hours, 0);
  const solvedClients = new Set(p.solved_cases.map((c) => c.client_label)).size;
  const email = isValidEmail(p.email) ? p.email : null;
  const cases = [...p.solved_cases].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="font-sans text-body-s">
      {/* Identity */}
      <div className="flex items-start gap-4">
        <Avatar name={p.person.name} seed={p.person.id} size="lg" />
        <div className="min-w-0">
          <h2 id={titleId} className="text-heading-xs font-bold">
            {p.person.name}
          </h2>
          <p className="text-body-s font-medium text-textStrong">{p.title || p.person.role}</p>
          <p className="text-body-xs text-textMuted">{p.person.team}</p>
        </div>
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-body-xs text-textMuted">
        {p.location && (
          <li className="inline-flex items-center gap-1.5">
            <MapPin aria-hidden="true" className="size-4 text-iconMuted" />
            {p.location}
          </li>
        )}
        {p.languages.length > 0 && (
          <li className="inline-flex items-center gap-1.5">
            <Languages aria-hidden="true" className="size-4 text-iconMuted" />
            <span className="sr-only">Languages: </span>
            {p.languages.join(", ")}
          </li>
        )}
        {p.years_at_sdworx != null && (
          <li className="inline-flex items-center gap-1.5">
            <Briefcase aria-hidden="true" className="size-4 text-iconMuted" />
            {p.years_at_sdworx} {p.years_at_sdworx === 1 ? "year" : "years"} at SD Worx
          </li>
        )}
      </ul>

      {/* Contact */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {email && (
          <a href={`mailto:${email}`} className="btn-secondary min-h-9 px-3 py-1.5 text-body-xs">
            <Mail aria-hidden="true" className="size-4" />
            Email {p.person.name.split(" ")[0]}
          </a>
        )}
        <button type="button" className="btn-ghost min-h-9 border border-border px-3 py-1.5 text-body-xs" aria-describedby={slackNote ? `${titleId}-slack` : undefined} onClick={() => setSlackNote(true)}>
          <MessageSquare aria-hidden="true" className="size-4" />
          Message in Slack
        </button>
        {slackNote && (
          <span id={`${titleId}-slack`} role="status" className="text-caption text-textMuted">
            Slack is not connected in this demo.
          </span>
        )}
      </div>

      {p.bio && <p className="mt-5 text-body-s text-text">{p.bio}</p>}

      {/* Reliability */}
      <Section title="Reliability">
        <div className="flex items-start gap-4 rounded-lg bg-backgroundAlt p-4">
          <ReliabilityRing score={p.reliability.score} size={72} caption />
          <ul className="space-y-1.5 text-body-xs text-text">
            {p.reliability.reasons.map((r) => (
              <li key={r} className="flex gap-2">
                <BadgeCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-iconMuted" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* Expertise */}
      <Section title="Expertise">
        <ul className="flex flex-wrap gap-2" aria-label="Expertise domains">
          {p.domains.map((d) => (
            <li key={d} className="rounded-full border border-primary/30 bg-primarySubtle px-3 py-1 text-body-xs font-medium text-primaryPressed">
              {d}
            </li>
          ))}
        </ul>
        {p.countries.length > 0 && <p className="mt-2 text-caption text-textMuted">Countries: {p.countries.join(", ")}</p>}
      </Section>

      {/* Horizontal lane */}
      <Lane
        dimension="horizontal"
        title="Client records"
        summary={`${formatHours(totalHours)} logged across ${p.contributions.length} client${p.contributions.length === 1 ? "" : "s"}`}
      >
        {p.contributions.length === 0 ? (
          <p className="text-body-xs text-textMuted">No client work logged yet.</p>
        ) : (
          <ul className="space-y-3">
            {p.contributions.map((c, i) => {
              const label = c.client_label || c.client_id || "Client";
              return (
                <li key={`${label}-${i}`}>
                  <div className="flex items-baseline justify-between gap-3 text-body-xs">
                    <span className="truncate font-semibold text-textStrong">{label}</span>
                    <span className="shrink-0 tabular-nums text-textMuted">{formatHours(c.hours)}</span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={`Hours at ${label}`}
                    aria-valuemin={0}
                    aria-valuemax={Math.round(maxHours)}
                    aria-valuenow={Math.round(c.hours)}
                    className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-progress-track"
                  >
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((c.hours / maxHours) * 100)}%` }} />
                  </div>
                  <p className="mt-0.5 text-caption text-textMuted">
                    {monthYear(c.first_date)} – {monthYear(c.last_date)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Lane>

      {/* Vertical lane */}
      <Lane
        dimension="vertical"
        title="Problems solved across clients"
        summary={`Solved ${cases.length} case${cases.length === 1 ? "" : "s"} across ${solvedClients} client${solvedClients === 1 ? "" : "s"}`}
      >
        {cases.length === 0 ? (
          <p className="text-body-xs text-textMuted">No solved cases recorded yet.</p>
        ) : (
          <ol className="space-y-2">
            {cases.map((c) => (
              <li key={c.dossier_item_id} className="rounded-md border border-borderSubtle bg-secondarySubtle/50 px-3 py-2">
                <p className="text-body-xs font-semibold text-textStrong">{c.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-caption text-textMuted">
                  <span className="font-medium text-secondary">{c.client_label}</span>
                  <span aria-hidden="true">·</span>
                  <span>{CATEGORY_LABEL[c.category] ?? c.category}</span>
                  <span aria-hidden="true">·</span>
                  <time dateTime={c.date}>{formatDate(c.date)}</time>
                </p>
              </li>
            ))}
          </ol>
        )}
      </Lane>

      {/* Documents */}
      <Section title="Documents" icon={<FileText aria-hidden="true" className="size-4 text-iconMuted" />}>
        {p.documents.length === 0 ? (
          <p className="text-body-xs text-textMuted">No documents authored yet.</p>
        ) : (
          <ul className="space-y-3">
            {[...p.documents]
              .sort((a, b) => b.trust.score - a.trust.score)
              .map((d) => (
                <li key={d.id} className="rounded-md border border-borderSubtle p-3">
                  <p className="mb-2 text-body-xs font-semibold text-textStrong">{d.title}</p>
                  <TrustBadge trust={d.trust} expandable />
                </li>
              ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function ProfileSkeleton() {
  const bar = "rounded bg-borderSubtle animate-pulse motion-reduce:animate-none";
  return (
    <div role="status" aria-label="Loading profile">
      <div className="flex items-center gap-4">
        <div className={`size-16 rounded-full ${bar}`} />
        <div className="flex-1 space-y-2">
          <div className={`h-5 w-2/3 ${bar}`} />
          <div className={`h-4 w-1/2 ${bar}`} />
        </div>
      </div>
      <div className={`mt-6 h-20 w-full ${bar}`} />
      <div className={`mt-6 h-32 w-full ${bar}`} />
      <div className={`mt-6 h-32 w-full ${bar}`} />
    </div>
  );
}

// ------------------------------------------------------------------ triggers for reuse

interface PersonChipProps {
  person: PersonRef;
  /** Show the role under the name. */
  showRole?: boolean;
  className?: string;
}

/** Avatar + name as a button that opens the profile drawer. */
export function PersonChip({ person, showRole = false, className = "" }: PersonChipProps) {
  const { open } = useProfileDrawer();
  return (
    <button
      type="button"
      onClick={() => open(person.id)}
      className={`inline-flex max-w-full items-center gap-2 rounded-full border border-borderSubtle bg-surface py-0.5 pl-0.5 pr-3 text-left transition-colors hover:border-primary hover:bg-primarySubtle ${className}`}
    >
      <Avatar name={person.name} seed={person.id} size={showRole ? "sm" : "xs"} />
      <span className="min-w-0">
        <span className="block truncate text-body-xs font-semibold text-textStrong">{person.name}</span>
        {showRole && <span className="block truncate text-caption text-textMuted">{person.role}</span>}
      </span>
      <span className="sr-only">(open profile)</span>
    </button>
  );
}

/** Avatar-only button that opens the profile drawer. */
export function PersonAvatarButton({ person, size = "md" }: { person: PersonRef; size?: "xs" | "sm" | "md" | "lg" }) {
  const { open } = useProfileDrawer();
  return (
    <button type="button" onClick={() => open(person.id)} aria-label={`Open profile of ${person.name}`} className="rounded-full">
      <Avatar name={person.name} seed={person.id} size={size} />
    </button>
  );
}
