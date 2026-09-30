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
  /** "wide" = lanes side by side (chat); "narrow" = stacked (channel side panel). */
  layout?: "wide" | "narrow";
  showGrid?: boolean;
  idPrefix: string;
}

/** The grid + horizontal lane + vertical lane + experts for one check result. */
export function CheckResultView({ result, timeline = [], newItemLabel, layout = "wide", showGrid = true, idPrefix, noun = "email", applied, recordUpdated, busyKey, approachApplied, onApply, onUpdateRecord, onApplyApproach, onAskSlack }: Props) {
  const narrow = layout === "narrow";
  const conflicts = result.horizontal_findings.filter((f) => f.kind === "conflict");
  const context = `${result.client.name}${result.topic ? `: ${result.topic}` : ""}`;
  return (
    <div className="space-y-4">
      {showGrid && <GridMap clientName={result.client.name} docs={docsFromCheck(result, timeline)} cases={result.similar_cases} newItemLabel={newItemLabel} compact={narrow} />}
      <div className={narrow ? "space-y-3" : "grid gap-4 lg:grid-cols-2"}>
        <Lane dim="horizontal" status={result.horizontal} id={`${idPrefix}-hz`} title={`${result.client.name}'s record`}>
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
          <QuietFindings findings={result.horizontal_findings} />
          {result.horizontal_findings.length === 0 && <p className="text-caption text-textMuted">Nothing in this text touches {result.client.name}'s record yet.</p>}
        </Lane>
        <Lane dim="vertical" status={result.vertical} id={`${idPrefix}-vt`}>
          {result.approach_warning && <ApproachCard w={result.approach_warning} onApply={onApplyApproach} applied={approachApplied} noun={noun} />}
          {result.similar_cases.map((c) => (
            <SimilarCaseItem key={c.dossier_item_id} c={c} />
          ))}
          {result.similar_cases.length === 0 && !result.approach_warning && <p className="text-caption text-textMuted">No other client had this problem yet.</p>}
        </Lane>
      </div>
      <section aria-labelledby={`${idPrefix}-experts`}>
        <h3 id={`${idPrefix}-experts`} className="mb-2 flex items-center gap-2 text-body-xs font-bold text-heading">
          <Users aria-hidden="true" className="size-4 text-hz" /> Who to ask
        </h3>
        <ExpertsList record={result.experts.record_expert} problem={result.problem_experts} context={context} onAskSlack={onAskSlack} compact={narrow} />
      </section>
    </div>
  );
}
