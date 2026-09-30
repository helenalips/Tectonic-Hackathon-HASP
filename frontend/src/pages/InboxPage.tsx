import { Archive, Flag, Inbox, Paperclip, PenSquare, Reply, Save, Send, Sparkles, Star, Trash2, X } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, errorMessage } from "../api/client";
import type { Expert } from "../api/types";
import { AssistantPanel } from "../components/assistant/AssistantPanel";
import { HighlightedTextarea } from "../components/assistant/HighlightedTextarea";
import { useComposerAssistant } from "../components/assistant/useComposerAssistant";
import { Modal } from "../components/Modal";
import { Avatar } from "../components/profile/Avatar";
import { useToast } from "../components/Toast";
import { useClients } from "../lib/clients";
import { CLIENT_CONTACTS, EMAIL_DRAFTS, INBOX, type ComposeDraft, type InboxMessage } from "../lib/demo";

interface Draft {
  clientId: string;
  to: string;
  subject: string;
  body: string;
}

function Composer({ initial, onClose, onSent }: { initial: Draft; onClose: () => void; onSent: (d: Draft) => void }) {
  const { clients } = useClients();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [d, setD] = useState<Draft>(initial);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const clientName = clients.find((c) => c.id === d.clientId)?.name ?? "this client";
  const toId = useId();
  const subjId = useId();
  const bodyId = useId();
  const clientSel = useId();
  useEffect(() => setD(initial), [initial]);

  const onAskSlack = (e: Expert) => navigate(`/slack?dm=${encodeURIComponent(e.person.id)}`);
  const { state, highlights, actions, timeline, unresolved } = useComposerAssistant({
    clientId: d.clientId,
    clientName,
    body: d.body,
    setBody: (body) => setD((x) => ({ ...x, body })),
    subject: d.subject,
    channel: "email",
    onAskSlack,
  });

  function load(x: ComposeDraft) {
    setD({ clientId: x.client_id, to: CLIENT_CONTACTS[x.client_id]?.email ?? "", subject: x.subject ?? "", body: x.text });
  }
  async function saveToRecord() {
    setSaving(true);
    try {
      await api.createEvent({ client_id: d.clientId, type: "email", text: d.body, ...(d.subject ? { title: d.subject } : {}) });
      toast({ title: "Saved to the record", detail: `${clientName}: stored as an email and checked for duplicates.` });
      state.recheck();
    } catch (e) {
      toast({ title: "Couldn't save to the record", detail: errorMessage(e), tone: "info" });
    } finally {
      setSaving(false);
    }
  }
  function send() {
    if (unresolved > 0) setConfirm(true);
    else onSent(d);
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px]">
      <section aria-label="New email" className="flex min-h-0 flex-col bg-surface">
        <div className="flex items-center gap-2 border-b border-borderSubtle px-5 py-2.5">
          <button type="button" className="btn-sm bg-primary text-surface hover:bg-primaryHover" onClick={send}>
            <Send aria-hidden="true" className="size-3.5" /> Send
          </button>
          <button type="button" className="btn-sm border border-border text-textStrong hover:border-primary" onClick={() => void saveToRecord()} disabled={saving || d.body.trim().length < 3}>
            <Save aria-hidden="true" className="size-3.5" /> {saving ? "Saving…" : "Save to record"}
          </button>
          <button type="button" className="btn-sm text-textMuted hover:bg-background" aria-label="Attach file">
            <Paperclip aria-hidden="true" className="size-3.5" />
          </button>
          <button type="button" className="btn-sm ml-auto text-textMuted hover:bg-background" onClick={onClose}>
            <X aria-hidden="true" className="size-3.5" /> Discard
          </button>
        </div>
        <div className="space-y-0 border-b border-borderSubtle px-5 text-body-xs">
          <div className="flex items-center gap-3 border-b border-borderSubtle py-2">
            <label htmlFor={clientSel} className="w-16 text-textMuted">
              Client
            </label>
            <select
              id={clientSel}
              value={d.clientId}
              onChange={(e) => setD((x) => ({ ...x, clientId: e.target.value, to: CLIENT_CONTACTS[e.target.value]?.email ?? x.to }))}
              className="rounded-full border border-hz/40 bg-hz-soft px-3 py-0.5 text-caption font-bold text-heading"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <span className="text-caption text-textMuted">TrustGrid checks against this client ↔ and all clients ↕</span>
          </div>
          <div className="flex items-center gap-3 border-b border-borderSubtle py-2">
            <label htmlFor={toId} className="w-16 text-textMuted">
              To
            </label>
            <input id={toId} value={d.to} onChange={(e) => setD((x) => ({ ...x, to: e.target.value }))} className="flex-1 bg-transparent py-1 text-textStrong" />
          </div>
          <div className="flex items-center gap-3 py-2">
            <label htmlFor={subjId} className="w-16 text-textMuted">
              Subject
            </label>
            <input id={subjId} value={d.subject} onChange={(e) => setD((x) => ({ ...x, subject: e.target.value }))} className="flex-1 bg-transparent py-1 font-semibold text-textStrong" />
          </div>
        </div>
        <label htmlFor={bodyId} className="sr-only">
          Message
        </label>
        <div className="flex min-h-0 flex-1 flex-col">
          <HighlightedTextarea id={bodyId} value={d.body} onValueChange={(body) => setD((x) => ({ ...x, body }))} highlights={highlights} placeholder="Write your email. TrustGrid checks it as you type." spellCheck />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 border-t border-borderSubtle px-5 py-2.5">
          <span className="mr-1 text-caption font-semibold text-textMuted">Quick start:</span>
          {EMAIL_DRAFTS.map((x) => (
            <button key={x.id} type="button" className="chip min-h-7 py-0.5 text-caption" title={x.hint} onClick={() => load(x)}>
              <Sparkles aria-hidden="true" className="size-3.5 text-hz" /> {x.label}
            </button>
          ))}
        </div>
      </section>
      <AssistantPanel state={state} clientName={clientName} channelLabel="Outlook" timeline={timeline} {...actions} />
      {confirm && (
        <Modal
          title="Send anyway?"
          description={
            <>
              Your email still has {unresolved} {unresolved === 1 ? "inconsistency" : "inconsistencies"} with {clientName}'s record. The client may receive information that contradicts
              what we promised earlier.
            </>
          }
          onClose={() => setConfirm(false)}
          footer={
            <>
              <button type="button" className="btn-ghost" data-autofocus onClick={() => setConfirm(false)}>
                Review first
              </button>
              <button
                type="button"
                className="btn bg-danger-text text-surface hover:opacity-90"
                onClick={() => {
                  setConfirm(false);
                  onSent(d);
                }}
              >
                Send anyway
              </button>
            </>
          }
        />
      )}
    </div>
  );
}

function Reading({ m, onReply }: { m: InboxMessage; onReply: () => void }) {
  return (
    <article className="animate-fade-in h-full overflow-y-auto bg-surface px-8 py-6" aria-label={m.subject}>
      <h2 className="text-heading-s font-bold text-ink">{m.subject}</h2>
      <div className="mt-4 flex items-center gap-3">
        <Avatar name={m.from} size="md" />
        <div className="min-w-0">
          <p className="text-body-xs font-bold text-textStrong">{m.from}</p>
          <p className="text-caption text-textMuted">
            {m.fromEmail} · {m.date}
          </p>
        </div>
        <div className="ml-auto flex gap-1.5">
          <button type="button" className="btn-sm bg-primary text-surface hover:bg-primaryHover" onClick={onReply}>
            <Reply aria-hidden="true" className="size-3.5" /> Reply
          </button>
          <button type="button" className="btn-sm border border-border text-textMuted" aria-label="Archive">
            <Archive aria-hidden="true" className="size-3.5" />
          </button>
          <button type="button" className="btn-sm border border-border text-textMuted" aria-label="Delete">
            <Trash2 aria-hidden="true" className="size-3.5" />
          </button>
        </div>
      </div>
      <p className="mt-6 max-w-2xl whitespace-pre-wrap text-body-s leading-relaxed text-textStrong">{m.body}</p>
      {m.replyDraft && (
        <div className="mt-8 max-w-2xl rounded-2xl border border-hz/30 bg-hz-subtle p-4">
          <p className="text-caption font-bold uppercase tracking-eyebrow text-hz">TrustGrid</p>
          <p className="mt-1 text-body-xs text-textStrong">Reply and I'll check your answer against this client's record ↔ and every other client ↕ while you type.</p>
        </div>
      )}
    </article>
  );
}

export function InboxPage() {
  const location = useLocation();
  const { toast } = useToast();
  const [messages, setMessages] = useState(INBOX);
  const [selected, setSelected] = useState<string>(INBOX[0].id);
  const [composer, setComposer] = useState<Draft | null>(null);
  const [sent, setSent] = useState<Draft[]>([]);

  // Draft handed over from the chat ("Open in Outlook") or ?compose=<draft id> for presenters.
  useEffect(() => {
    const st = (location.state as { draft?: { client_id: string; subject?: string; text: string } } | null)?.draft;
    if (st) setComposer({ clientId: st.client_id, to: CLIENT_CONTACTS[st.client_id]?.email ?? "", subject: st.subject ?? "", body: st.text });
    const id = new URLSearchParams(location.search).get("compose");
    const x = EMAIL_DRAFTS.find((e) => e.id === id);
    if (x) setComposer({ clientId: x.client_id, to: CLIENT_CONTACTS[x.client_id]?.email ?? "", subject: x.subject ?? "", body: x.text });
  }, [location.state, location.search]);

  const current = useMemo(() => messages.find((m) => m.id === selected) ?? messages[0], [messages, selected]);

  function reply(m: InboxMessage) {
    const x = EMAIL_DRAFTS.find((e) => e.id === m.replyDraft);
    const clientId = m.client_id ?? "cl-kaneka";
    setComposer({ clientId, to: m.fromEmail, subject: x?.subject ?? `Re: ${m.subject}`, body: x?.text ?? "" });
  }

  return (
    <div className="grid h-[calc(100vh-56px)] grid-cols-[300px_minmax(0,1fr)] overflow-hidden">
      <section aria-label="Mailbox" className="flex min-h-0 flex-col border-r border-borderSubtle bg-backgroundAlt">
        <div className="flex items-center gap-2 px-4 pb-2 pt-4">
          <Inbox aria-hidden="true" className="size-4 text-hz" />
          <h1 className="text-body-s font-bold text-ink">Inbox</h1>
          <span className="rounded-full bg-hz-soft px-2 text-caption font-bold text-hz">{messages.filter((m) => m.unread).length}</span>
          <button
            type="button"
            className="btn-sm ml-auto bg-primary text-surface hover:bg-primaryHover"
            onClick={() => setComposer({ clientId: "cl-kaneka", to: CLIENT_CONTACTS["cl-kaneka"].email, subject: "", body: "" })}
          >
            <PenSquare aria-hidden="true" className="size-3.5" /> New email
          </button>
        </div>
        <p className="px-4 pb-2 text-[11px] text-textMuted">Outlook · sofie.maes@sdworx.example</p>
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {sent.map((s, i) => (
            <li key={`sent-${i}`} className="mb-1 rounded-xl bg-success-subtle px-3 py-2 text-caption">
              <p className="font-bold text-success-text">Sent · {s.to}</p>
              <p className="truncate text-textStrong">{s.subject || "(no subject)"}</p>
            </li>
          ))}
          {messages.map((m) => {
            const active = !composer && current.id === m.id;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  aria-current={active ? "true" : undefined}
                  onClick={() => {
                    setComposer(null);
                    setSelected(m.id);
                    setMessages((ms) => ms.map((x) => (x.id === m.id ? { ...x, unread: false } : x)));
                  }}
                  className={`mb-1 flex w-full gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-fast ${active ? "bg-surface shadow-soft ring-1 ring-hz/30" : "hover:bg-surface"}`}
                >
                  <Avatar name={m.from} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className={`truncate text-caption ${m.unread ? "font-bold text-ink" : "font-semibold text-textStrong"}`}>{m.from}</span>
                      {m.flagged && <Flag aria-label="Flagged" className="size-3 shrink-0 text-danger-text" />}
                      <span className="ml-auto shrink-0 text-[11px] text-textMuted">{m.date}</span>
                    </span>
                    <span className={`block truncate text-caption ${m.unread ? "font-semibold text-hz" : "text-textStrong"}`}>{m.subject}</span>
                    <span className="line-clamp-2 text-[11px] text-textMuted">{m.preview}</span>
                  </span>
                  {m.unread && <Star aria-label="Unread" className="size-3 shrink-0 fill-hz text-hz" />}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      <div className="min-h-0">
        {composer ? (
          <Composer
            initial={composer}
            onClose={() => setComposer(null)}
            onSent={(d) => {
              setSent((s) => [d, ...s]);
              setComposer(null);
              toast({ title: `Sent to ${d.to}`, detail: "A copy is linked to the client record." });
            }}
          />
        ) : (
          <Reading m={current} onReply={() => reply(current)} />
        )}
      </div>
    </div>
  );
}
