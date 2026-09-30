import { X } from "lucide-react";
import type { SimilarCase, SourceDoc } from "../../api/types";
import { CATEGORY_LABEL, DOC_TYPE_LABEL, formatDate, pct } from "../../lib/format";
import { DOC_TYPE_ICON } from "../icons";
import { PersonChip } from "../profile/ProfileDrawer";
import { TrustBadge } from "../TrustBadge";

/** A source document: title, author (opens profile), date, excerpt and an expandable trust badge. */
export function SourceDocCard({ doc, onClose, tone = "horizontal" }: { doc: SourceDoc; onClose?: () => void; tone?: "horizontal" | "vertical" }) {
  const Icon = DOC_TYPE_ICON[doc.type];
  const v = tone === "vertical";
  return (
    <article className={`animate-fade-in rounded-xl border bg-surface p-4 shadow-soft ${v ? "border-vt/30" : "border-hz/30"}`} aria-label={`Source: ${doc.title}`}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className={`inline-flex size-9 shrink-0 items-center justify-center rounded-lg ${v ? "bg-vt-soft text-vt" : "bg-hz-soft text-hz"}`}>
          <Icon className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-caption font-semibold uppercase tracking-eyebrow text-textMuted">
            {DOC_TYPE_LABEL[doc.type]}
            {doc.client_label ? ` · ${doc.client_label}` : ""} · {formatDate(doc.date)}
          </p>
          <h4 className="mt-0.5 text-body-s font-bold text-ink">{doc.title}</h4>
        </div>
        {onClose && (
          <button type="button" className="btn-ghost -mr-2 -mt-1 min-h-8 px-2" aria-label="Close source" onClick={onClose}>
            <X aria-hidden="true" className="size-4" />
          </button>
        )}
      </div>
      <p className="mt-3 border-l-2 border-borderSubtle pl-3 text-body-xs text-text">“{doc.excerpt}”</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <PersonChip person={doc.author} />
        <TrustBadge trust={doc.trust} expandable />
      </div>
    </article>
  );
}

/** A solved case at another client (vertical). Solvers open their profile. */
export function CaseCard({ c, onClose }: { c: SimilarCase; onClose?: () => void }) {
  return (
    <article className="animate-fade-in rounded-xl border border-vt/30 bg-surface p-4 shadow-soft" aria-label={`Similar case at ${c.client_label}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-caption font-semibold uppercase tracking-eyebrow text-vt">
            {c.client_label} · {CATEGORY_LABEL[c.category] ?? c.category} · {formatDate(c.date)}
          </p>
          <h4 className="mt-0.5 text-body-s font-bold text-ink">{c.title}</h4>
        </div>
        {onClose && (
          <button type="button" className="btn-ghost -mr-2 -mt-1 min-h-8 px-2" aria-label="Close case" onClick={onClose}>
            <X aria-hidden="true" className="size-4" />
          </button>
        )}
      </div>
      <p className="mt-2 text-body-xs text-text">
        <span className="font-semibold text-textStrong">How it was solved: </span>
        {c.resolution_summary}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-caption font-semibold text-textMuted">Solved by</span>
        {c.solvers.map((p) => (
          <PersonChip key={p.id} person={p} />
        ))}
        <span className="ml-auto text-caption font-semibold text-textMuted">{pct(c.similarity)} similar</span>
      </div>
      {c.sources[0] && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-vt-subtle px-3 py-2">
          <span className="min-w-0 truncate text-caption text-textStrong">{c.sources[0].title}</span>
          <TrustBadge trust={c.sources[0].trust} />
        </div>
      )}
    </article>
  );
}
