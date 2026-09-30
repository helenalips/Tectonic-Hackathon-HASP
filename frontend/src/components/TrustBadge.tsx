import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import type { TrustScore } from "../api/types";
import { status } from "../theme/tokens";
import { trustBand, TONE } from "../lib/tones";
import { STATUS_ICON } from "./icons";
import { TrustFactors } from "./TrustFactors";

interface TrustBadgeProps {
  trust: TrustScore;
  /** When true the badge is a button that expands the factor table. */
  expandable?: boolean;
  className?: string;
}

/** Icon + label + score. The band is derived from the score so label and icon always agree. */
export function TrustBadge({ trust, expandable = false, className = "" }: TrustBadgeProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const band = trustBand(trust.score);
  const meta = status.trust[band];
  const Icon = STATUS_ICON[meta.icon];
  const tone = TONE[meta.tone];

  const content = (
    <>
      <Icon aria-hidden="true" data-icon={meta.icon} className={`size-4 shrink-0 ${tone.icon}`} strokeWidth={2.25} />
      <span>{meta.label}</span>
      <span className="font-medium tabular-nums opacity-90">{trust.score}</span>
    </>
  );
  const pillClass = `inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-body-xs font-semibold ${tone.pill}`;

  if (!expandable) {
    return (
      <span className={`${pillClass} ${className}`} aria-label={`Trust: ${meta.label}, score ${trust.score} of 100`}>
        {content}
      </span>
    );
  }
  return (
    <div className={className}>
      <button
        type="button"
        className={`${pillClass} hover:brightness-95`}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Trust: ${meta.label}, score ${trust.score} of 100. ${open ? "Hide" : "Show"} why`}
        onClick={() => setOpen((v) => !v)}
      >
        {content}
        <ChevronDown aria-hidden="true" className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div id={panelId} className="mt-3">
          <TrustFactors factors={trust.factors} />
        </div>
      )}
    </div>
  );
}
