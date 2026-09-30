import { FlaskConical, LoaderCircle, ShieldX } from "lucide-react";
import type { ReactNode } from "react";
import type { TimelineItem } from "../../api/types";
import { DimensionPill } from "../grid/Lanes";
import { TrustGridMark } from "../grid/TrustGridMark";
import { CheckResultView, type CheckActions } from "./CheckResultView";
import type { DraftCheckState } from "./useDraftCheck";

interface Props extends CheckActions {
  state: DraftCheckState;
  clientName: string;
  channelLabel: string;
  timeline?: TimelineItem[];
  emptyHint?: ReactNode;
}

/** Copilot-style side panel that lives inside a channel (Outlook, Slack) and checks what you type. */
export function AssistantPanel({ state, clientName, channelLabel, timeline, emptyHint, ...actions }: Props) {
  const { result, loading, preview, error } = state;
  return (
    <aside aria-label="TrustGrid assistant" className="flex h-full min-h-0 flex-col border-l border-borderSubtle bg-surface">
      <div className="border-b border-borderSubtle px-4 pb-3 pt-4">
        <div className="flex items-center gap-2">
          <TrustGridMark size={22} />
          <p className="text-body-xs font-extrabold text-ink">TrustGrid</p>
          <span className="text-caption text-textMuted">in {channelLabel}</span>
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-textMuted">
            {loading ? (
              <>
                <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin text-hz" /> Checking…
              </>
            ) : preview ? (
              <>
                <FlaskConical aria-hidden="true" className="size-3.5" /> Preview data
              </>
            ) : result ? (
              "Up to date"
            ) : null}
          </span>
        </div>
        <div className="mt-3 flex flex-col gap-1.5">
          <DimensionPill dim="horizontal" status={result?.horizontal ?? null} loading={loading && !result} />
          <DimensionPill dim="vertical" status={result?.vertical ?? null} loading={loading && !result} />
        </div>
        <p className="sr-only" aria-live="polite">
          {result ? `${result.horizontal.headline}. ${result.vertical.headline}.` : ""}
        </p>
      </div>
      <div className={`min-h-0 flex-1 overflow-y-auto px-4 py-4 transition-opacity duration-base ${loading && result ? "opacity-70" : ""}`}>
        {error && <p className="mb-3 rounded-lg bg-danger-subtle px-3 py-2 text-caption text-danger-text">{error}</p>}
        {result?.suspicious && (
          <p className="mb-3 flex gap-2 rounded-lg bg-danger-subtle px-3 py-2 text-caption text-textStrong">
            <ShieldX aria-hidden="true" className="size-4 shrink-0 text-danger-text" /> {result.suspicious_reason}
          </p>
        )}
        {result ? (
          <CheckResultView idPrefix="panel" result={result} timeline={timeline} layout="narrow" {...actions} />
        ) : loading ? (
          <div className="space-y-3" role="status" aria-label="Checking">
            <div className="skeleton h-36 rounded-2xl" />
            <div className="skeleton h-28 rounded-2xl" />
            <div className="skeleton h-28 rounded-2xl" />
          </div>
        ) : (
          <div className="animate-fade-in space-y-3 text-caption text-text">
            <p className="text-body-xs font-bold text-ink">Start typing. I check every sentence as you write.</p>
            <div className="rounded-2xl border-l-4 border-hz bg-hz-subtle p-3">
              <p className="font-bold uppercase tracking-eyebrow text-hz">↔ Horizontal</p>
              <p className="mt-1">Against everything we promised and recorded for {clientName}.</p>
            </div>
            <div className="rounded-2xl border-l-4 border-vt bg-vt-subtle p-3">
              <p className="font-bold uppercase tracking-eyebrow text-vt">↕ Vertical</p>
              <p className="mt-1">Against every other client: who had the same problem, how it was solved, and who solved it.</p>
            </div>
            {emptyHint}
          </div>
        )}
      </div>
    </aside>
  );
}
