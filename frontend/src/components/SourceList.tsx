import { Link2 } from "lucide-react";
import type { Citation } from "../api/types";
import { formatDate, plural } from "../lib/format";
import { TrustBadge } from "./TrustBadge";

/** Numbered sources an answer or draft is built on, each with an expandable trust badge. */
export function SourceList({ citations, idPrefix = "source" }: { citations: Citation[]; idPrefix?: string }) {
  if (citations.length === 0) return <p className="text-body-s text-textMuted">No sources.</p>;
  return (
    <ol className="space-y-3">
      {citations.map((c) => (
        <li key={`${c.ref}-${c.document_id}`} id={`${idPrefix}-${c.ref}`} tabIndex={-1} className="scroll-mt-24 rounded-md border border-borderSubtle bg-surface p-4 target:border-primary">
          <div className="flex flex-wrap items-start gap-3">
            <span aria-hidden="true" className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primaryTint text-body-xs font-bold text-navy">
              {c.ref}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-body-s font-semibold text-textStrong">
                <span className="sr-only">Source {c.ref}: </span>
                {c.title}
              </p>
              <p className="mt-0.5 text-body-xs text-textMuted">
                {c.author.name} · {formatDate(c.date)}
              </p>
              <p className="mt-2 inline-flex items-center gap-1.5 text-body-xs font-semibold text-info-text">
                <Link2 aria-hidden="true" className="size-4" />
                Confirmed by {plural(c.confirmed_by, "document")}
              </p>
              <TrustBadge trust={c.trust} expandable className="mt-3" />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
