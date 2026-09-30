import { useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "../../api/client";
import type { ApproachWarning, Channel, Expert, HorizontalFinding, TimelineItem } from "../../api/types";
import { useToast } from "../Toast";
import { replaceQuote, updateRecordFromDraft } from "./actions";
import { findingKey, type CheckActions } from "./CheckResultView";
import type { Highlight } from "./HighlightedTextarea";
import { useDraftCheck } from "./useDraftCheck";

/**
 * Glue between a channel composer and the TrustGrid assistant: live check, inline highlights,
 * "Update my email" (rewrite in place, animated), "Update the record" and "Use the proven approach".
 */
export function useComposerAssistant(args: {
  clientId: string | null;
  clientName: string;
  body: string;
  setBody: (v: string) => void;
  subject?: string;
  channel: Channel;
  onAskSlack?: (e: Expert) => void;
}) {
  const { clientId, clientName, body, setBody, subject, channel, onAskSlack } = args;
  const { toast } = useToast();
  const state = useDraftCheck(clientId, body, { subject, channel });
  const [flash, setFlash] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const noun = channel === "email" ? "email" : "message";

  useEffect(() => {
    let live = true;
    setTimeline([]);
    if (clientId) api.client(clientId).then((r) => live && setTimeline(r.timeline)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [clientId]);

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 1800);
    return () => window.clearTimeout(t);
  }, [flash]);

  const highlights = useMemo<Highlight[]>(() => {
    const hs: Highlight[] = [];
    if (flash) hs.push({ quote: flash, tone: "applied" });
    // Only highlight findings that still match the current text.
    state.result?.horizontal_findings.forEach((f) => {
      if (f.kind === "conflict") hs.push({ quote: f.draft_quote, tone: "conflict" });
      else if (f.kind === "confirmed") hs.push({ quote: f.draft_quote, tone: "confirmed" });
    });
    const w = state.result?.approach_warning;
    if (w?.draft_quote) hs.push({ quote: w.draft_quote, tone: "approach" });
    return hs;
  }, [state.result, flash]);

  const unresolved = state.result?.horizontal_findings.filter((f) => f.kind === "conflict" && body.includes(f.draft_quote.trim())).length ?? 0;

  const actions: CheckActions = {
    noun,
    busyKey,
    onApply: (f: HorizontalFinding) => {
      if (!f.suggested_rewrite) return;
      setBody(replaceQuote(body, f.draft_quote, f.suggested_rewrite));
      setFlash(f.suggested_rewrite);
      toast({ title: `Your ${noun} is updated`, detail: `${f.key_label} now matches ${clientName}'s record.` });
    },
    onApplyApproach: (w: ApproachWarning) => {
      if (!w.suggested_rewrite || !w.draft_quote) return;
      setBody(replaceQuote(body, w.draft_quote, w.suggested_rewrite));
      setFlash(w.suggested_rewrite);
      toast({ title: "Proven approach applied", detail: "Based on how other clients solved the same problem." });
    },
    onUpdateRecord: async (f: HorizontalFinding) => {
      if (!clientId) return;
      setBusyKey(findingKey(f));
      try {
        const r = await updateRecordFromDraft({ clientId, text: body, subject, type: channel === "email" ? "email" : "note", finding: f });
        toast({ title: `Record updated${r.superseded ? ` · ${r.superseded}'s promise superseded` : ""}`, detail: `${clientName}: ${f.key_label} now follows your ${noun}.` });
        state.recheck();
      } catch (e) {
        toast({ title: "Couldn't update the record", detail: errorMessage(e), tone: "info" });
      } finally {
        setBusyKey(null);
      }
    },
    onAskSlack,
  };

  return { state, highlights, actions, timeline, unresolved };
}
