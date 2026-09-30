import { ArrowUpRight, Building2, CornerDownLeft, LoaderCircle, Search } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, errorMessage } from "../api/client";
import type { Answer, CheckResult, TimelineItem } from "../api/types";
import { AnswerText } from "../pages/AskPage";
import { CheckResultView } from "./assistant/CheckResultView";
import { DimensionPill } from "./grid/Lanes";
import { TrustGridMark } from "./grid/TrustGridMark";
import { useClients } from "../lib/clients";

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const SUGGEST = ["Which discount did we agree for the pay equity audit?", "Who solved an overtime premium problem before?", "Can we propose digital clocking to SK hi-tech?"];

interface Props {
  onClose: () => void;
  initialClientId?: string;
  initialQuery?: string;
}

/** ⌘K overlay: ask about a client from any page; answer + ↔ / ↕ lanes inline. */
export function CommandPalette({ onClose, initialClientId, initialQuery = "" }: Props) {
  const { clients } = useClients();
  const navigate = useNavigate();
  const [clientId, setClientId] = useState(initialClientId ?? "");
  const [q, setQ] = useState(initialQuery);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<{ q: string; answer: Answer | null; check: CheckResult | null; timeline: TimelineItem[] } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const selId = useId();

  useEffect(() => {
    if (!clientId && clients.length) setClientId(clients.find((c) => c.id === "cl-kaneka")?.id ?? clients[0].id);
  }, [clients, clientId]);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, []);

  const autoRan = useRef(false);
  useEffect(() => {
    if (initialQuery && clientId && !autoRan.current) {
      autoRan.current = true;
      void run(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function run(question: string) {
    const t = question.trim();
    if (t.length < 3 || !clientId) return;
    setBusy(true);
    setError(null);
    const [a, c, r] = await Promise.allSettled([api.ask({ client_id: clientId, question: t.slice(0, 1000) }), api.check({ client_id: clientId, channel: "chat", text: t }), api.client(clientId)]);
    if (a.status === "rejected" && c.status === "rejected") setError(errorMessage(a.reason));
    else setRes({ q: t, answer: a.status === "fulfilled" ? a.value : null, check: c.status === "fulfilled" ? c.value.result : null, timeline: r.status === "fulfilled" ? r.value.timeline : [] });
    setBusy(false);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void run(q);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !ref.current) return;
    const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (!items.length) return;
    if (e.shiftKey && document.activeElement === items[0]) {
      e.preventDefault();
      items[items.length - 1].focus();
    } else if (!e.shiftKey && document.activeElement === items[items.length - 1]) {
      e.preventDefault();
      items[0].focus();
    }
  }

  const clientName = clients.find((c) => c.id === clientId)?.name ?? "";
  return (
    <div className="fixed inset-0 z-[55] flex items-start justify-center bg-navy/30 p-4 pt-[8vh] backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown} className="animate-pop flex max-h-[84vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-surface shadow-pop">
        <h2 id={titleId} className="sr-only">
          Ask TrustGrid
        </h2>
        <form onSubmit={submit} className="flex items-center gap-3 border-b border-borderSubtle px-5 py-3">
          {busy ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin text-hz" /> : <Search aria-hidden="true" className="size-5 text-iconMuted" />}
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Ask TrustGrid"
            placeholder="Ask about this client, or paste a sentence to check…"
            className="h-10 flex-1 bg-transparent text-body-s text-textStrong placeholder:text-textMuted focus-visible:shadow-none"
          />
          <span className="relative inline-flex items-center">
            <Building2 aria-hidden="true" className="pointer-events-none absolute left-2.5 size-3.5 text-hz" />
            <label htmlFor={selId} className="sr-only">
              Client
            </label>
            <select id={selId} value={clientId} onChange={(e) => setClientId(e.target.value)} className="max-w-52 appearance-none truncate rounded-full border border-hz/40 bg-hz-soft py-1 pl-7 pr-3 text-caption font-bold text-heading">
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </span>
          <kbd className="kbd">Esc</kbd>
        </form>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" aria-live="polite">
          {error && <p className="rounded-lg bg-danger-subtle px-3 py-2 text-caption text-danger-text">{error}</p>}
          {!res && !busy && (
            <div>
              <p className="text-caption font-bold uppercase tracking-eyebrow text-textMuted">Try</p>
              <ul className="mt-2 space-y-1">
                {SUGGEST.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-body-xs text-textStrong hover:bg-hz-subtle"
                      onClick={() => {
                        setQ(s);
                        void run(s);
                      }}
                    >
                      <CornerDownLeft aria-hidden="true" className="size-4 text-iconMuted" /> {s}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {busy && !res && (
            <div className="space-y-3" role="status" aria-label="Checking">
              <div className="skeleton h-4 w-2/3" />
              <div className="skeleton h-32 rounded-2xl" />
            </div>
          )}
          {res && (
            <div className={`space-y-4 ${busy ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 text-body-xs font-extrabold text-ink">
                  <TrustGridMark size={18} /> {clientName}
                </span>
                {res.check && <DimensionPill dim="horizontal" status={res.check.horizontal} />}
                {res.check && <DimensionPill dim="vertical" status={res.check.vertical} />}
                <button
                  type="button"
                  className="btn-sm ml-auto text-hz hover:bg-hz-subtle"
                  onClick={() => {
                    onClose();
                    navigate("/", { state: { q: res.q } });
                  }}
                >
                  Open in chat <ArrowUpRight aria-hidden="true" className="size-3.5" />
                </button>
              </div>
              {res.answer && <AnswerText text={res.answer.answer} citations={res.answer.citations} />}
              {res.check && <CheckResultView idPrefix="palette" result={res.check} timeline={res.timeline} newItemLabel="Your question" onAskSlack={(e) => { onClose(); navigate(`/slack?dm=${encodeURIComponent(e.person.id)}`); }} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
