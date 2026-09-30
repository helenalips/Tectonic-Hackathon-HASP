import { ArrowUp, Building2, Check, ChevronDown, Copy, FlaskConical, LoaderCircle, Mail, MessageSquareQuote, RotateCcw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, errorMessage } from "../api/client";
import type { Answer, ApproachWarning, CheckResult, Expert, HorizontalFinding, TimelineItem } from "../api/types";
import { replaceQuote, updateRecordFromDraft } from "../components/assistant/actions";
import { CheckResultView, findingKey } from "../components/assistant/CheckResultView";
import { HighlightedText, type Highlight } from "../components/assistant/HighlightedTextarea";
import { looksLikeDraft } from "../components/grid/gridData";
import { DimensionPill } from "../components/grid/Lanes";
import { SignatureRule, TrustGridMark } from "../components/grid/TrustGridMark";
import { ErrorState } from "../components/States";
import { useToast } from "../components/Toast";
import { useAuth } from "../lib/auth";
import { useClients } from "../lib/clients";
import { CHAT_DRAFTS, EMAIL_DRAFTS, type ComposeDraft } from "../lib/demo";
import { AnswerText } from "./AskPage";
import { ASK_EVENT } from "./AppShell";

interface Turn {
  id: number;
  clientId: string;
  clientName: string;
  asked: string;
  subject?: string;
  isDraft: boolean;
  status: "loading" | "done" | "error";
  error?: string;
  answer: Answer | null;
  check: CheckResult | null;
  preview: boolean;
  timeline: TimelineItem[];
  /** Current version of the user's text (changes when a rewrite is applied). */
  draft: string;
  flash: string | null;
  applied: Set<string>;
  recordUpdated: Set<string>;
  approachApplied: boolean;
}

const SUGGESTIONS: ComposeDraft[] = [EMAIL_DRAFTS[0], CHAT_DRAFTS[1], EMAIL_DRAFTS[1], EMAIL_DRAFTS[3]];

function Welcome() {
  return (
    <div className="animate-fade-in mx-auto grid max-w-4xl gap-4 py-2 md:grid-cols-3">
      <div className="rounded-3xl bg-hz-soft p-5 md:col-span-1">
        <MessageSquareQuote aria-hidden="true" className="size-6 text-hz" />
        <p className="mt-3 text-body-s font-bold leading-snug text-heading">“I found three documents. Which one do I send to the client?”</p>
        <p className="mt-2 text-caption text-textMuted">The moment of doubt. Ask it here, or paste the email you're about to send.</p>
      </div>
      <div className="rounded-2xl border-l-4 border-hz bg-hz-subtle p-5">
        <p className="text-caption font-bold uppercase tracking-eyebrow text-hz">↔ Horizontal</p>
        <p className="mt-1 text-body-s font-bold text-heading">The client record</p>
        <p className="mt-1 text-caption text-text">Everything about one client across different divisions, each item linked to who did it.</p>
      </div>
      <div className="rounded-2xl border-l-4 border-vt bg-vt-subtle p-5">
        <p className="text-caption font-bold uppercase tracking-eyebrow text-vt">↕ Vertical</p>
        <p className="mt-1 text-body-s font-bold text-heading">Across all clients</p>
        <p className="mt-1 text-caption text-text">Same problem elsewhere: what was the solution, and who solved it?</p>
      </div>
    </div>
  );
}

function withResolvedStatus(t: Turn): CheckResult | null {
  const c = t.check;
  if (!c) return null;
  const conflicts = c.horizontal_findings.filter((f) => f.kind === "conflict");
  const handled = conflicts.filter((f) => t.applied.has(findingKey(f)) || t.recordUpdated.has(findingKey(f)));
  if (conflicts.length > 0 && handled.length === conflicts.length) {
    return { ...c, horizontal: { status: "consistent", headline: "Consistent · all inconsistencies handled" } };
  }
  return c;
}

function TurnView({ t, onUpdate, onAskSlack }: { t: Turn; onUpdate: (id: number, patch: Partial<Turn> | ((t: Turn) => Partial<Turn>)) => void; onAskSlack: (e: Expert) => void }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const check = withResolvedStatus(t);
  const noun = t.isDraft ? "email" : "text";

  const highlights: Highlight[] = [];
  if (t.flash) highlights.push({ quote: t.flash, tone: "applied" });
  t.check?.horizontal_findings.forEach((f) => {
    const k = findingKey(f);
    if (f.kind === "conflict" && !t.applied.has(k) && !t.recordUpdated.has(k)) highlights.push({ quote: f.draft_quote, tone: "conflict" });
    if (f.kind === "confirmed") highlights.push({ quote: f.draft_quote, tone: "confirmed" });
  });
  if (t.check?.approach_warning?.draft_quote && !t.approachApplied) highlights.push({ quote: t.check.approach_warning.draft_quote, tone: "approach" });

  const apply = (f: HorizontalFinding) => {
    if (!f.suggested_rewrite) return;
    onUpdate(t.id, (cur) => ({ draft: replaceQuote(cur.draft, f.draft_quote, f.suggested_rewrite!), flash: f.suggested_rewrite, applied: new Set(cur.applied).add(findingKey(f)) }));
    toast({ title: `Your ${noun} is updated`, detail: "It now matches the client record." });
  };
  const applyApproach = (w: ApproachWarning) => {
    if (!w.suggested_rewrite || !w.draft_quote) return;
    onUpdate(t.id, (cur) => ({ draft: replaceQuote(cur.draft, w.draft_quote!, w.suggested_rewrite!), flash: w.suggested_rewrite, approachApplied: true }));
    toast({ title: "Proven approach applied", detail: "Based on how other clients solved the same problem." });
  };
  const updateRecord = async (f: HorizontalFinding) => {
    setBusyKey(findingKey(f));
    try {
      const r = await updateRecordFromDraft({ clientId: t.clientId, text: t.draft, subject: t.subject, finding: f });
      onUpdate(t.id, (cur) => ({ recordUpdated: new Set(cur.recordUpdated).add(findingKey(f)) }));
      toast({ title: `Record updated${r.superseded ? ` · ${r.superseded}'s promise superseded` : ""}`, detail: `${t.clientName}: ${f.key_label} now follows your ${noun}.` });
    } catch (e) {
      toast({ title: "Couldn't update the record", detail: errorMessage(e), tone: "info" });
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <li className="space-y-4">
      {/* user turn */}
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-3xl rounded-br-lg border border-hz/25 bg-hz-soft px-5 py-3 text-body-xs text-heading shadow-soft">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-eyebrow text-hz">
            {t.isDraft ? "Email draft" : "Question"} · {t.clientName}
          </p>
          <p className={`whitespace-pre-wrap ${t.isDraft ? "line-clamp-2" : "line-clamp-6"}`}>{t.asked}</p>
        </div>
      </div>

      {/* assistant turn */}
      <div className="animate-fade-in rounded-3xl border border-borderSubtle bg-surface p-5 shadow-soft">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 pr-2 text-body-xs font-extrabold text-ink">
            <TrustGridMark size={20} /> TrustGrid
          </span>
          <DimensionPill dim="horizontal" status={check?.horizontal ?? null} loading={t.status === "loading"} />
          <DimensionPill dim="vertical" status={check?.vertical ?? null} loading={t.status === "loading"} />
          {t.preview && (
            <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-textMuted" title="Answered by the built-in preview engine">
              <FlaskConical aria-hidden="true" className="size-3.5" /> Preview data
            </span>
          )}
        </div>

        {t.status === "loading" && (
          <div className="space-y-3" role="status" aria-label="Checking against the record and all clients">
            <div className="skeleton h-4 w-3/4" />
            <div className="skeleton h-4 w-1/2" />
            <div className="skeleton h-40 w-full rounded-2xl" />
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="skeleton h-32 rounded-2xl" />
              <div className="skeleton h-32 rounded-2xl" />
            </div>
          </div>
        )}
        {t.status === "error" && <ErrorState message={t.error} />}

        {t.status === "done" && (
          <div className="space-y-5">
            {t.isDraft ? (
              <div>
                <p className="text-body-s font-bold text-ink">
                  I checked your {noun} against {t.clientName}'s record <span className="text-hz">↔</span> and all clients <span className="text-vt">↕</span>.
                </p>
                <div className="mt-3 rounded-2xl border border-borderSubtle bg-backgroundAlt">
                  <div className="flex flex-wrap items-center gap-2 border-b border-borderSubtle px-4 py-2">
                    <Mail aria-hidden="true" className="size-4 text-iconMuted" />
                    <span className="min-w-0 flex-1 truncate text-caption font-semibold text-textStrong">{t.subject ?? "Your draft"}</span>
                    <button
                      type="button"
                      className="btn-sm text-textStrong hover:bg-surface"
                      onClick={() => {
                        void navigator.clipboard?.writeText(t.draft).then(() => setCopied(true));
                        window.setTimeout(() => setCopied(false), 1500);
                      }}
                    >
                      {copied ? <Check aria-hidden="true" className="size-3.5" /> : <Copy aria-hidden="true" className="size-3.5" />} {copied ? "Copied" : "Copy"}
                    </button>
                    <button type="button" className="btn-sm text-textStrong hover:bg-surface" onClick={() => navigate("/inbox", { state: { draft: { client_id: t.clientId, subject: t.subject, text: t.draft } } })}>
                      <Mail aria-hidden="true" className="size-3.5" /> Open in Outlook
                    </button>
                  </div>
                  <HighlightedText text={t.draft} highlights={highlights} className="px-4 py-3 text-body-xs leading-relaxed text-textStrong" />
                </div>
              </div>
            ) : (
              t.answer && (
                <div>
                  <AnswerText text={t.answer.answer} citations={t.answer.citations} />
                  {t.answer.citations.length > 0 && (
                    <ol className="mt-3 flex flex-wrap gap-1.5">
                      {t.answer.citations.map((c) => (
                        <li key={c.ref} id={`source-${c.ref}`} tabIndex={-1} className="inline-flex items-center gap-1.5 rounded-full border border-borderSubtle bg-backgroundAlt px-2.5 py-1 text-caption text-textStrong">
                          <span className="font-bold text-hz">[{c.ref}]</span> {c.title}
                          <span className="text-textMuted">· {c.author.name}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                  {t.answer.uncertainties.length > 0 && (
                    <p className="mt-3 rounded-xl bg-warning-subtle px-3 py-2 text-caption text-textStrong">
                      <span className="font-bold">Not sure: </span>
                      {t.answer.uncertainties.join(" ")}
                    </p>
                  )}
                </div>
              )
            )}
            {check && (
              <CheckResultView
                idPrefix={`turn-${t.id}`}
                result={check}
                timeline={t.timeline}
                newItemLabel={t.isDraft ? "Your email" : "Your question"}
                noun={noun}
                applied={t.applied}
                recordUpdated={t.recordUpdated}
                approachApplied={t.approachApplied}
                busyKey={busyKey}
                onApply={t.isDraft ? apply : undefined}
                onApplyApproach={t.isDraft ? applyApproach : undefined}
                onUpdateRecord={t.isDraft ? updateRecord : undefined}
                onAskSlack={onAskSlack}
              />
            )}
          </div>
        )}
      </div>
    </li>
  );
}

// Ready in the composer on first open: one email that lights up both grid dimensions at once
// (↔ contradicts Jan's 10% discount promise, ↕ other clients solved the pay gap report with one integrated system).
const STARTER_DRAFT =
  "Dear Kaneka HR team,\n\nFor the pay gap report we will calculate the adjusted and unadjusted pay gap manually in Excel, combining a payroll export with the job matrix. The report is invoiced at full price.\n\nKind regards,\nSofie Maes";

export function ChatPage() {
  const { clients } = useClients();
  const { me } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [clientId, setClientId] = useState<string>("");
  const [text, setText] = useState(STARTER_DRAFT);
  const [turns, setTurns] = useState<Turn[]>([]);
  const seq = useRef(1);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const pickerId = useId();
  const inputId = useId();

  useEffect(() => {
    if (!clientId && clients.length) setClientId(clients.find((c) => c.id === "cl-kaneka")?.id ?? clients[0].id);
  }, [clients, clientId]);

  const update = useCallback((id: number, patch: Partial<Turn> | ((t: Turn) => Partial<Turn>)) => {
    setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, ...(typeof patch === "function" ? patch(t) : patch) } : t)));
  }, []);

  const send = useCallback(
    async (raw: string, opts: { clientId?: string; subject?: string } = {}) => {
      const question = raw.trim();
      const cid = opts.clientId ?? clientId;
      if (question.length < 3 || !cid) return;
      const client = clients.find((c) => c.id === cid);
      const id = seq.current++;
      const isDraft = looksLikeDraft(question);
      const turn: Turn = {
        id,
        clientId: cid,
        clientName: client?.name ?? "this client",
        asked: question,
        subject: opts.subject,
        isDraft,
        status: "loading",
        answer: null,
        check: null,
        preview: false,
        timeline: [],
        draft: question,
        flash: null,
        applied: new Set(),
        recordUpdated: new Set(),
        approachApplied: false,
      };
      setTurns((ts) => [...ts, turn]);
      setText("");
      window.setTimeout(() => listRef.current?.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      const [ask, check, rec] = await Promise.allSettled([
        isDraft ? Promise.resolve(null) : api.ask({ client_id: cid, question: question.slice(0, 1000) }),
        api.check({ client_id: cid, channel: isDraft ? "email" : "chat", text: question, ...(opts.subject ? { subject: opts.subject } : {}) }),
        api.client(cid),
      ]);
      if (check.status === "rejected" && ask.status === "rejected") {
        update(id, { status: "error", error: errorMessage(check.reason) });
        return;
      }
      update(id, {
        status: "done",
        answer: ask.status === "fulfilled" ? ask.value : null,
        check: check.status === "fulfilled" ? check.value.result : null,
        preview: check.status === "fulfilled" && check.value.preview,
        timeline: rec.status === "fulfilled" ? rec.value.timeline : [],
      });
    },
    [clientId, clients, update],
  );

  // Question handed over from the top-bar ask box on another page.
  const handled = useRef(false);
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    const q = (location.state as { q?: string } | null)?.q;
    if (q && clientId && lastKey.current !== location.key) {
      lastKey.current = location.key;
      navigate(".", { replace: true, state: null });
      void send(q);
    }
  }, [location.state, location.key, clientId, send, navigate]);

  // Presenter shortcut: /?demo=<draft id> sends that quick-start draft.
  useEffect(() => {
    const demo = new URLSearchParams(location.search).get("demo");
    const d = [...EMAIL_DRAFTS, ...CHAT_DRAFTS].find((x) => x.id === demo);
    if (d && clients.length && !handled.current) {
      handled.current = true;
      setClientId(d.client_id);
      void send(d.text, { clientId: d.client_id, subject: d.subject });
    }
  }, [location.search, clients, send]);

  useEffect(() => {
    const onAsk = (e: Event) => {
      const q = (e as CustomEvent<{ q?: string }>).detail?.q;
      if (q) void send(q);
      else inputRef.current?.focus();
    };
    window.addEventListener(ASK_EVENT, onAsk);
    return () => window.removeEventListener(ASK_EVENT, onAsk);
  }, [send]);

  function submit(e: FormEvent) {
    e.preventDefault();
    void send(text);
  }
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(text);
    }
  }
  function pickDraft(d: ComposeDraft) {
    setClientId(d.client_id);
    void send(d.text, { clientId: d.client_id, subject: d.subject });
  }
  const onAskSlack = (e: Expert) => navigate(`/slack?dm=${encodeURIComponent(e.person.id)}`);

  const empty = turns.length === 0;
  const firstName = me?.person.name.split(" ")[0] ?? "";

  return (
    <div className="mx-auto flex h-[calc(100vh-56px)] max-w-[1180px] flex-col px-6 pt-6">
      <header className={empty ? "pb-5" : "pb-3"}>
        {empty ? (
          <div className="animate-fade-in">
            <p className="text-caption font-bold uppercase tracking-eyebrow text-hz">Ask TrustGrid{firstName ? ` · Hi ${firstName}` : ""}</p>
            <h1 className="mt-2 max-w-4xl font-display text-display-l font-extrabold tracking-tightest text-ink xl:text-display-xl">
              One source of truth per client, checked against every client.
            </h1>
            <SignatureRule className="mt-5 max-w-md" />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-heading-s font-extrabold tracking-tightest text-ink">Ask TrustGrid</h1>
            <span className="text-caption text-textMuted">Every answer is checked against the record ↔ and all clients ↕</span>
            <button type="button" className="btn-sm ml-auto text-textStrong hover:bg-surface" onClick={() => setTurns([])}>
              <RotateCcw aria-hidden="true" className="size-3.5" /> New chat
            </button>
            <SignatureRule className="mt-1" />
          </div>
        )}
      </header>

      <section aria-label="Conversation" className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-3xl border border-b-0 border-borderSubtle bg-background/60">
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {empty ? <Welcome /> : null}
          <ol ref={listRef} className="space-y-8" aria-live="polite">
            {turns.map((t) => (
              <TurnView key={t.id} t={t} onUpdate={update} onAskSlack={onAskSlack} />
            ))}
          </ol>
        </div>

        <form onSubmit={submit} className="border-t border-borderSubtle bg-surface px-5 pb-4 pt-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <label htmlFor={pickerId} className="text-caption font-semibold text-textMuted">
              Talking about:
            </label>
            <span className="relative inline-flex items-center">
              <Building2 aria-hidden="true" className="pointer-events-none absolute left-2.5 size-3.5 text-hz" />
              <select
                id={pickerId}
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="appearance-none rounded-full border border-hz/40 bg-hz-soft py-1 pl-7 pr-7 text-caption font-bold text-heading hover:border-hz"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2 size-3.5 text-hz" />
            </span>
            <span className="ml-auto hidden text-[11px] text-textMuted md:inline">
              <kbd className="kbd">Enter</kbd> to send · <kbd className="kbd">Shift</kbd>+<kbd className="kbd">Enter</kbd> new line
            </span>
          </div>
          <div className="flex items-end gap-2 rounded-2xl border border-border bg-surface p-2 shadow-0 transition-colors focus-within:border-hz focus-within:shadow-soft">
            <label htmlFor={inputId} className="sr-only">
              Ask a question, or paste the email you're about to send
            </label>
            <textarea
              ref={inputRef}
              id={inputId}
              value={text}
              rows={text.split("\n").length > 2 ? Math.min(10, text.split("\n").length) : 2}
              maxLength={20000}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask a question, or paste the email you're about to send…"
              className="min-h-12 flex-1 resize-none bg-transparent px-2 py-1.5 text-body-s text-textStrong placeholder:text-textMuted focus-visible:shadow-none"
            />
            <button type="submit" className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-surface transition-colors hover:bg-primaryHover disabled:opacity-40" disabled={text.trim().length < 3 || turns.some((t) => t.status === "loading")} aria-label="Send">
              {turns.some((t) => t.status === "loading") ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin" /> : <ArrowUp aria-hidden="true" className="size-5" />}
            </button>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Suggestions">
            {SUGGESTIONS.map((d) => (
              <button key={d.id} type="button" className="chip min-h-7 py-0.5 text-caption" title={d.hint} onClick={() => pickDraft(d)}>
                <Sparkles aria-hidden="true" className="size-3.5 text-hz" />
                {d.label}
              </button>
            ))}
          </div>
        </form>
      </section>
    </div>
  );
}
