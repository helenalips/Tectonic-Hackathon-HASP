import type { Conflict, DocRef } from "../api/types";
import { status } from "../theme/tokens";
import { claimLabel, claimValue, formatDate } from "../lib/format";
import { STATUS_ICON } from "./icons";
import { Tag } from "./Tag";
import { TrustBadge } from "./TrustBadge";

function Side({ heading, doc, fact, trust, accent }: { heading: string; doc: DocRef | null; fact?: string; trust?: Conflict["new_claim"]; accent: string }) {
  return (
    <div className={`min-w-0 rounded-md border border-borderSubtle border-t-4 ${accent} bg-surface p-4`}>
      <p className="text-body-xs font-semibold text-textMuted">{heading}</p>
      {fact && <p className="mt-1 font-display text-heading-xxs font-bold text-heading">{fact}</p>}
      {doc ? (
        <>
          <p className="mt-2 text-body-s font-semibold text-textStrong">{doc.title}</p>
          {doc.excerpt && <p className="mt-1 text-body-xs text-text">“{doc.excerpt}”</p>}
          <p className="mt-2 text-body-xs text-textMuted">
            {[doc.author?.name, formatDate(doc.date)].filter(Boolean).join(" · ") || "Author and date not recorded"}
          </p>
        </>
      ) : (
        <p className="mt-2 text-body-xs text-textMuted">No document attached</p>
      )}
      {trust && <TrustBadge trust={trust.trust} className="mt-3" />}
    </div>
  );
}

/** Existing vs new, side by side, with severity and a plain-language explanation. */
export function ConflictCompare({ conflict }: { conflict: Conflict }) {
  const sev = status.severity[conflict.severity];
  const across = conflict.scope === "across_records";
  const existingFact = conflict.existing_claim ? `${claimLabel(conflict.existing_claim.key)}: ${claimValue(conflict.existing_claim.value, conflict.existing_claim.unit)}` : undefined;
  const newFact = conflict.new_claim ? `${claimLabel(conflict.new_claim.key)}: ${claimValue(conflict.new_claim.value, conflict.new_claim.unit)}` : undefined;
  return (
    <div className="@container space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Tag tone={sev.tone} icon={STATUS_ICON[sev.icon]}>
          {sev.label} severity
        </Tag>
        <Tag tone={across ? "across" : "info"}>{across ? "Across clients" : "This client record"}</Tag>
      </div>
      <p className="text-body-s font-medium text-textStrong">{conflict.explanation}</p>
      <div className="grid gap-3 @lg:grid-cols-2">
        <Side
          heading={across ? "Proven approach at another client" : "In the record"}
          doc={conflict.existing_document}
          fact={existingFact}
          trust={conflict.existing_claim}
          accent={across ? "border-t-secondary" : "border-t-primary"}
        />
        <Side heading="New information" doc={conflict.new_document} fact={newFact} trust={conflict.new_claim} accent="border-t-danger-bold" />
      </div>
    </div>
  );
}
