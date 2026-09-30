import { useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { TimelineItem } from "../api/types";
import { CheckResultView } from "../components/assistant/CheckResultView";
import { useDraftCheck } from "../components/assistant/useDraftCheck";
import { SignatureRule } from "../components/grid/TrustGridMark";
import { useClients } from "../lib/clients";

const DEFAULT_TOPIC: Record<string, string> = {
  "cl-kaneka": "Invoice the pay equity audit follow-up at full price.",
  "cl-skhitech": "Propose the digital clocking app for all shifts in Q4.",
  "cl-afriflora": "Overtime premium of 150% on rest days.",
  "cl-cityd": "Adjusted and unadjusted pay gap report per job level.",
  "cl-globalpaint": "Overtime premium for night shifts across sites.",
};

/** The grid on its own: pick a client (row ↔) and a topic (column ↕) and see where they cross. */
export function GridPage() {
  const { clients } = useClients();
  const navigate = useNavigate();
  const [clientId, setClientId] = useState("");
  const [topic, setTopic] = useState("");
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const topicId = useId();

  useEffect(() => {
    if (!clientId && clients.length) {
      const id = clients.find((c) => c.id === "cl-kaneka")?.id ?? clients[0].id;
      setClientId(id);
      setTopic(DEFAULT_TOPIC[id] ?? "");
    }
  }, [clients, clientId]);
  useEffect(() => {
    if (!clientId) return;
    let live = true;
    api.client(clientId).then((r) => live && setTimeline(r.timeline)).catch(() => live && setTimeline([]));
    return () => {
      live = false;
    };
  }, [clientId]);

  const state = useDraftCheck(clientId || null, topic, { channel: "note", minLength: 6 });

  return (
    <div className="mx-auto max-w-content px-6 pb-16 pt-8">
      <p className="text-caption font-bold uppercase tracking-eyebrow text-hz">The grid</p>
      <h1 className="mt-1 font-display text-display-l font-extrabold tracking-tightest text-ink">Where your work meets the record and every client.</h1>
      <SignatureRule className="mt-4 max-w-md" />

      <div className="mt-6 rounded-3xl border border-borderSubtle bg-surface p-5 shadow-soft">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Client row">
          {clients.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={c.id === clientId}
              onClick={() => {
                setClientId(c.id);
                setTopic(DEFAULT_TOPIC[c.id] ?? topic);
              }}
              className={`chip ${c.id === clientId ? "border-hz bg-hz-soft text-heading" : ""}`}
            >
              ↔ {c.name}
              {c.open_conflicts > 0 && <span className="rounded-full bg-danger-subtle px-1.5 text-caption font-bold text-danger-text">{c.open_conflicts}</span>}
            </button>
          ))}
        </div>
        <label htmlFor={topicId} className="mt-4 block text-caption font-bold uppercase tracking-eyebrow text-vt">
          ↕ New item: what are you working on?
        </label>
        <input id={topicId} value={topic} onChange={(e) => setTopic(e.target.value)} className="field mt-1.5" placeholder="Type a sentence, a promise or a problem…" />
        <div className="mt-5" aria-live="polite">
          {state.result ? (
            <div className={state.loading ? "opacity-70 transition-opacity" : ""}>
              <CheckResultView idPrefix="gridpage" result={state.result} timeline={timeline} newItemLabel="New item" onAskSlack={(e) => navigate(`/slack?dm=${encodeURIComponent(e.person.id)}`)} />
            </div>
          ) : (
            <div className="skeleton h-72 rounded-2xl" role="status" aria-label="Loading the grid" />
          )}
        </div>
      </div>
    </div>
  );
}
