import { Children, useState, type ReactNode } from "react";
import { Users } from "lucide-react";
import type { ApproachWarning, CheckResult, Expert, HorizontalFinding, TimelineItem } from "../../api/types";
import { GridMap } from "../grid/GridMap";
import { docsFromCheck } from "../grid/gridData";
import { ApproachCard, ExpertsList, FindingCard, Lane, QuietFindings, SimilarCaseItem } from "../grid/Lanes";

export interface CheckActions {
  noun?: string;
  applied?: Set<string>;
  recordUpdated?: Set<string>;
  busyKey?: string | null;
  approachApplied?: boolean;
  onApply?: (f: HorizontalFinding) => void;
  onUpdateRecord?: (f: HorizontalFinding) => void;
  onApplyApproach?: (w: ApproachWarning) => void;
  onAskSlack?: (e: Expert) => void;
}

export const findingKey = (f: HorizontalFinding) => `${f.key ?? f.key_label}:${f.draft_quote}`;

interface Props extends CheckActions {
  result: CheckResult;
  timeline?: TimelineItem[];
  newItemLabel?: string;
  /** Other client names drawn as grid rows (full-width views). */
  otherClients?: string[];
  /** "wide" = lanes side by side (chat); "narrow" = stacked (channel side panel). */
  layout?: "wide" | "narrow";
  showGrid?: boolean;
  idPrefix: string;
}

/** The grid + horizontal lane + vertical lane + experts for one check result. */
export function CheckResultView({ result, timeline = [], newItemLabel, otherClients, layout = "wide", showGrid = true, idPrefix, noun = "email", applied, recordUpdated, busyKey, approachApplied, onApply, onUpdateRecord, onApplyApproach, onAskSlack }: Props) {
  const narrow = layout === "narrow";
  const [showAllExperts, setShowAllExperts] = useState(false);
  const conflicts = result.horizontal_findings.filter((f) => f.kind === "conflict");
  const context = `${result.client.name}${result.topic ? `: ${result.topic}` : ""}`;
  return (
    <div className="space-y-4">
      {showGrid && <GridMap clientName={result.client.name} docs={docsFromCheck(result, timeline)} cases={result.similar_cases} newItemLabel={newItemLabel} compact={narrow} otherClients={otherClients} />}
      <div className={narrow ? "space-y-3" : "grid gap-4 lg:grid-cols-2"}>
        <Lane dim="horizontal" status={result.horizontal} id={`${idPrefix}-hz`} title={`${result.client.name}'s record`}>
          <More count={conflicts.length} first={1} label="inconsistency" labelPlural="inconsistencies">
          {conflicts.map((f) => (
            <FindingCard
              key={findingKey(f)}
              f={f}
              noun={noun}
              applied={applied?.has(findingKey(f))}
              recordUpdated={recordUpdated?.has(findingKey(f))}
              busy={busyKey === findingKey(f)}
              onApply={onApply}
              onUpdateRecord={result.client.can_edit ? onUpdateRecord : undefined}
            />
          ))}
          </More>
          {result.horizontal_findings.some((f) => f.kind !== "conflict") && (
            <More count={1} first={0} label="matching fact" labelPlural="matching facts" showLabel={(() => { const n = result.horizontal_findings.filter((f) => f.kind !== "conflict").length; return `… ${n} other ${n === 1 ? "fact" : "facts"} checked`; })()}>
              <QuietFindings findings={result.horizontal_findings} />
            </More>
          )}
          {result.horizontal_findings.length === 0 && <p className="text-caption text-textMuted">Nothing in this text touches {result.client.name}'s record yet.</p>}
        </Lane>
        <Lane dim="vertical" status={result.vertical} id={`${idPrefix}-vt`}>
          {result.approach_warning && <ApproachCard w={result.approach_warning} onApply={onApplyApproach} applied={approachApplied} noun={noun} />}
          <More count={result.similar_cases.length} first={result.approach_warning ? 0 : 1} label="similar case" labelPlural="similar cases">
            {result.similar_cases.map((c) => (
              <SimilarCaseItem key={c.dossier_item_id} c={c} />
            ))}
          </More>
          {result.similar_cases.length === 0 && !result.approach_warning && <p className="text-caption text-textMuted">No other client had this problem yet.</p>}
        </Lane>
      </div>
      <section aria-labelledby={`${idPrefix}-experts`}>
        <h3 id={`${idPrefix}-experts`} className="mb-2 flex items-center gap-2 text-body-xs font-bold text-heading">
          <Users aria-hidden="true" className="size-4 text-hz" /> Who to ask
        </h3>
        <ExpertsList record={result.experts.record_expert} problem={showAllExperts ? result.problem_experts : result.problem_experts.slice(0, 1)} context={context} onAskSlack={onAskSlack} compact={narrow} />
        {result.problem_experts.length > 1 && (
          <button type="button" className="mt-2 text-body-xs font-semibold text-hz hover:underline" onClick={() => setShowAllExperts((v) => !v)} aria-expanded={showAllExperts}>
            {showAllExperts ? "Show fewer people" : `… ${result.problem_experts.length - 1} more people solved this`}
          </button>
        )}
      </section>
    </div>
  );
}


/** Progressive disclosure: show the first `first` children, the rest behind a quiet "… N more" toggle. */
function More({ count, first, label, labelPlural, showLabel, children }: { count: number; first: number; label: string; labelPlural: string; showLabel?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const items = Children.toArray(children);
  const hidden = count - first;
  if (hidden <= 0) return <>{items}</>;
  return (
    <>
      {open ? items : items.slice(0, first)}
      <button type="button" className="text-body-xs font-semibold text-textMuted hover:text-heading hover:underline" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? "Show less" : showLabel ?? `… ${hidden} more ${hidden === 1 ? label : labelPlural}`}
      </button>
    </>
  );
}
