import type { ConsistencyStatus as Status } from "../api/types";
import { status as tokens } from "../theme/tokens";
import { plural } from "../lib/format";
import { TONE } from "../lib/tones";
import { STATUS_ICON } from "./icons";

export function consistencyText(s: Status): string {
  const conflicts = s.open_conflicts === 0 ? "0 conflicts" : `${plural(s.open_conflicts, "open conflict")}`;
  const dups = s.linked_duplicates === 0 ? "0 duplicates" : `${plural(s.linked_duplicates, "duplicate")} linked`;
  return `${conflicts} · ${dups}`;
}

interface Props {
  status: Status;
  variant?: "banner" | "inline";
}

/** "0 conflicts · 0 duplicates" / "1 open conflict · 3 duplicates linked", with icon and label. */
export function ConsistencyStatus({ status, variant = "banner" }: Props) {
  const consistent = status.open_conflicts === 0;
  const meta = consistent ? tokens.link.consistent : tokens.link.conflict;
  const Icon = STATUS_ICON[meta.icon];
  const tone = TONE[meta.tone];
  const text = consistencyText(status);

  if (variant === "inline") {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-body-xs font-semibold ${tone.pill}`}>
          <Icon aria-hidden="true" className={`size-4 ${tone.icon}`} strokeWidth={2.25} />
          {consistent ? "Consistent" : "Needs review"}
        </span>
        <span className="text-body-xs text-textStrong">{text}</span>
      </div>
    );
  }
  return (
    <div role="status" className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border-l-4 px-4 py-3 ${tone.panel}`}>
      <Icon aria-hidden="true" className={`size-5 shrink-0 ${tone.icon}`} strokeWidth={2.25} />
      <span className={`text-body-s font-semibold ${consistent ? "text-success-text" : "text-danger-text"}`}>
        {consistent ? "Consistent" : "Needs review"}
      </span>
      <span className="text-body-s text-textStrong">{text}</span>
    </div>
  );
}
