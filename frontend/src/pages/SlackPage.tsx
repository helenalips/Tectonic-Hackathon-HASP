import { AtSign, Hash, Lock, Send, Sparkles } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { Answer, CheckResult, Expert, TimelineItem } from "../api/types";
import { AssistantPanel } from "../components/assistant/AssistantPanel";
import { CheckResultView } from "../components/assistant/CheckResultView";
import { HighlightedTextarea } from "../components/assistant/HighlightedTextarea";
import { useComposerAssistant } from "../components/assistant/useComposerAssistant";
import { DimensionPill } from "../components/grid/Lanes";
import { TrustGridMark } from "../components/grid/TrustGridMark";
import { Avatar } from "../components/profile/Avatar";
import { useProfileDrawer } from "../components/profile/ProfileDrawer";
import { useAuth } from "../lib/auth";
import { useClients } from "../lib/clients";
import { CHAT_DRAFTS, SLACK_CHANNELS, SLACK_MESSAGES, type SlackChannel, type SlackMessage } from "../lib/demo";
import { AnswerText } from "./AskPage";

interface BotReply {
  answer: Answer | null;
  check: CheckResult | null;
  timeline: TimelineItem[];
  clientName: string;
}

type Msg = SlackMessage & { bot?: boolean; reply?: BotReply; loading?: boolean };

const DM_PERSON: Record<string, { id: string; name: string }> = {
  "dm-jan": { id: "p-jan", name: "Jan Peeters" },
  "dm-pieter": { id: "p-pieter", name: "Pieter Janssens" },
  "dm-katarzyna": { id: "p-katarzyna", name: "Katarzyna Wiśniewska" },
};

function BotCard({ r, onAskSlack, id }: { r: BotReply; onAskSlack: (e: Expert) => void; id: string }) {
  return (
    <div className="mt-2 max-w-3xl rounded-2xl border border-borderSubtle bg-surface p-4 shadow-soft">
      {r.check && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          <DimensionPill dim="horizontal" status={r.check.horizontal} />
          <DimensionPill dim="vertical" status={r.check.vertical} />
        </div>
      )}
      {r.answer && (
        <div className="mb-3 text-body-xs">
          <AnswerText text={r.answer.answer} citations={r.answer.citations} />
        </div>
      )}
      {r.check && <CheckResultView idPrefix={id} result={r.check} timeline={r.timeline} layout="wide" newItemLabel="Your message" onAskSlack={onAskSlack} />}
    </div>
  );
}

export function SlackPage() {
  const { clients } = useClients();
  const { me } = useAuth();
  const { open } = useProfileDrawer();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const dm = params.get("dm");
  const channels = useMemo<SlackChannel[]>(() => {
    if (!dm || SLACK_CHANNELS.some((c) => c.id === `dm-${dm.replace(/^p-/, "")}`)) return SLACK_CHANNELS;
    return [...SLACK_CHANNELS, { id: `dm-${dm.replace(/^p-/, "")}`, name: dm.replace(/^p-/, "").replace(/^\w/, (c) => c.toUpperCase()), kind: "dm", client_id: null, topic: "Direct message" }];
  }, [dm]);
  const initial = dm ? `dm-${dm.replace(/^p-/, "")}` : "clients-kaneka";
  const [channelId, setChannelId] = useState(initial);
  const [msgs, setMsgs] = useState<Record<string, Msg[]>>(() => ({ ...SLACK_MESSAGES }));
  const [text, setText] = useState("");
  const [pickedClient, setPickedClient] = useState("cl-kaneka");
  const seq = useRef(1);
  const listRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const clientSel = useId();

  useEffect(() => setChannelId(initial), [initial]);
  const channel = channels.find((c) => c.id === channelId) ?? channels[0];
  const clientId = channel.client_id ?? pickedClient;
  const clientName = clients.find((c) => c.id === clientId)?.name ?? "this client";
  const onAskSlack = (e: Expert) => setParams({ dm: e.person.id });

  const { state, highlights, actions, timeline } = useComposerAssistant({ clientId, clientName, body: text, setBody: setText, channel: "chat", onAskSlack });

  useEffect(() => {
    if (!dm) return;
    const who = DM_PERSON[`dm-${dm.replace(/^p-/, "")}`];
    if (!text) setText(`Hi${who ? ` ${who.name.split(" ")[0]}` : ""}, quick question: `);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dm]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, channelId]);

  async function post() {
    const t = text.trim();
    if (t.length < 2 || !me) return;
    const mine: Msg = { id: `u${seq.current++}`, author: { id: me.person.id, name: me.person.name }, time: "now", text: t };
    const botId = `b${seq.current++}`;
    const bot: Msg = { id: botId, author: { id: "trustgrid", name: "TrustGrid" }, time: "now", text: "", bot: true, loading: true };
    setMsgs((m) => ({ ...m, [channel.id]: [...(m[channel.id] ?? []), mine, bot] }));
    setText("");
    const [ask, check, rec] = await Promise.allSettled([api.ask({ client_id: clientId, question: t.slice(0, 1000) }), api.check({ client_id: clientId, channel: "chat", text: t }), api.client(clientId)]);
    const reply: BotReply = {
      answer: ask.status === "fulfilled" ? ask.value : null,
      check: check.status === "fulfilled" ? check.value.result : null,
      timeline: rec.status === "fulfilled" ? rec.value.timeline : [],
      clientName,
    };
    setMsgs((m) => ({ ...m, [channel.id]: (m[channel.id] ?? []).map((x) => (x.id === botId ? { ...x, loading: false, reply } : x)) }));
  }
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void post();
    }
  }

  const list = msgs[channel.id] ?? [];
  return (
    <div className="grid h-[calc(100vh-56px)] grid-cols-[240px_minmax(0,1fr)_400px] overflow-hidden xl:grid-cols-[240px_minmax(0,1fr)_440px]">
      <nav aria-label="Slack channels" className="flex min-h-0 flex-col bg-navy text-surface">
        <div className="border-b border-surface/10 px-4 py-4">
          <p className="text-body-xs font-extrabold">SD Worx</p>
          <p className="text-[11px] text-surface/70">Slack · {me?.person.name}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
          <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-eyebrow text-surface/60">Channels</p>
          {channels.filter((c) => c.kind === "channel").map((c) => (
            <button key={c.id} type="button" aria-current={c.id === channel.id ? "true" : undefined} onClick={() => setChannelId(c.id)} className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-caption ${c.id === channel.id ? "bg-primary font-bold" : "text-surface/85 hover:bg-surface/10"}`}>
              <Hash aria-hidden="true" className="size-3.5 shrink-0" /> <span className="truncate">{c.name}</span>
              {c.unread ? <span className="ml-auto rounded-full bg-newItem px-1.5 text-[10px] font-bold">{c.unread}</span> : null}
            </button>
          ))}
          <p className="mt-4 px-2 pb-1 text-[11px] font-bold uppercase tracking-eyebrow text-surface/60">Direct messages</p>
          {channels.filter((c) => c.kind === "dm").map((c) => (
            <button key={c.id} type="button" aria-current={c.id === channel.id ? "true" : undefined} onClick={() => setChannelId(c.id)} className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-caption ${c.id === channel.id ? "bg-primary font-bold" : "text-surface/85 hover:bg-surface/10"}`}>
              <Avatar name={c.name} size="xs" /> <span className="truncate">{c.name}</span>
            </button>
          ))}
          <p className="mt-4 px-2 pb-1 text-[11px] font-bold uppercase tracking-eyebrow text-surface/60">Apps</p>
          <p className="flex items-center gap-2 px-2 py-1.5 text-caption text-surface/85">
            <span className="rounded bg-surface p-0.5">
              <TrustGridMark size={14} />
            </span>
            TrustGrid
          </p>
        </div>
      </nav>

      <section aria-label={`#${channel.name}`} className="flex min-h-0 flex-col bg-surface">
        <header className="flex items-center gap-2 border-b border-borderSubtle px-5 py-3">
          {channel.kind === "channel" ? <Hash aria-hidden="true" className="size-4 text-textMuted" /> : <AtSign aria-hidden="true" className="size-4 text-textMuted" />}
          <h1 className="truncate text-body-s font-bold text-ink">{channel.name}</h1>
          <span className="hidden truncate text-caption text-textMuted 2xl:inline">{channel.topic}</span>
          {channel.client_id ? (
            <span className="ml-auto rounded-full border border-hz/40 bg-hz-soft px-3 py-0.5 text-caption font-bold text-heading">{clientName}</span>
          ) : (
            <span className="ml-auto flex items-center gap-2">
              <label htmlFor={clientSel} className="text-caption text-textMuted">
                About client
              </label>
              <select id={clientSel} value={pickedClient} onChange={(e) => setPickedClient(e.target.value)} className="rounded-full border border-hz/40 bg-hz-soft px-3 py-0.5 text-caption font-bold text-heading">
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </span>
          )}
        </header>
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4" aria-live="polite">
          {list.length === 0 && <p className="text-caption text-textMuted">No messages yet. Say hi.</p>}
          <ul className="space-y-4">
            {list.map((m) => (
              <li key={m.id} className="animate-fade-in flex gap-3">
                {m.bot ? (
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-borderSubtle bg-surface">
                    <TrustGridMark size={20} />
                  </span>
                ) : (
                  <button type="button" className="h-fit rounded-full" aria-label={`Open profile of ${m.author.name}`} onClick={() => open(m.author.id)}>
                    <Avatar name={m.author.name} seed={m.author.id} size="sm" />
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-caption">
                    <span className="font-bold text-ink">{m.author.name}</span>
                    {m.bot && <span className="ml-1.5 rounded bg-background px-1 text-[10px] font-bold text-textMuted">APP</span>}
                    <span className="ml-2 text-textMuted">{m.time}</span>
                  </p>
                  {m.text && <p className="whitespace-pre-wrap text-body-xs text-textStrong">{m.text}</p>}
                  {m.bot && m.loading && (
                    <div className="mt-2 max-w-3xl space-y-2" role="status" aria-label="TrustGrid is checking">
                      <div className="skeleton h-4 w-2/3" />
                      <div className="skeleton h-24 w-full rounded-2xl" />
                    </div>
                  )}
                  {m.bot && m.reply && (
                    <>
                      <p className="text-body-xs text-textStrong">Checked against {m.reply.clientName}'s record ↔ and all clients ↕:</p>
                      <BotCard r={m.reply} onAskSlack={onAskSlack} id={`bot-${m.id}`} />
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="border-t border-borderSubtle px-5 pb-3 pt-2">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {CHAT_DRAFTS.map((d) => (
              <button
                key={d.id}
                type="button"
                className="chip min-h-7 py-0.5 text-caption"
                title={d.hint}
                onClick={() => {
                  if (!channel.client_id) setPickedClient(d.client_id);
                  else if (channel.client_id !== d.client_id) setChannelId(d.client_id === "cl-skhitech" ? "clients-skhitech" : "clients-kaneka");
                  setText(d.text);
                }}
              >
                <Sparkles aria-hidden="true" className="size-3.5 text-hz" /> {d.label}
              </button>
            ))}
          </div>
          <div className="flex min-h-24 items-stretch rounded-xl border border-border focus-within:border-hz">
            <label htmlFor={inputId} className="sr-only">
              Message #{channel.name}
            </label>
            <div className="flex min-h-24 flex-1 flex-col">
              <HighlightedTextarea id={inputId} value={text} onValueChange={setText} highlights={highlights} onKeyDown={onKeyDown} placeholder={`Message ${channel.kind === "channel" ? "#" : ""}${channel.name}`} />
            </div>
            <div className="flex items-end p-2">
              <button type="button" className="inline-flex size-9 items-center justify-center rounded-lg bg-primary text-surface hover:bg-primaryHover disabled:opacity-40" aria-label="Send message" disabled={text.trim().length < 2} onClick={() => void post()}>
                <Send aria-hidden="true" className="size-4" />
              </button>
            </div>
          </div>
          <p className="mt-1 flex items-center gap-1 text-[11px] text-textMuted">
            <Lock aria-hidden="true" className="size-3" /> TrustGrid checks your message before you post it. <button type="button" className="link ml-1" onClick={() => navigate("/")}>Open the full chat</button>
          </p>
        </div>
      </section>

      <AssistantPanel state={state} clientName={clientName} channelLabel="Slack" timeline={timeline} {...actions} />
    </div>
  );
}
