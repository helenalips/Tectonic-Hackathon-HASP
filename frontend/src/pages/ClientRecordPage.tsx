import { Link2, OctagonAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../api/client";
import type { Conflict } from "../api/types";
import { ConflictCompare } from "../components/ConflictCompare";
import { ConflictModal } from "../components/ConflictModal";
import { GridMap } from "../components/grid/GridMap";
import { docsFromRecord } from "../components/grid/gridData";
import { ExpertsList, Lane, SimilarCaseItem } from "../components/grid/Lanes";
import { DOC_TYPE_ICON, STATUS_ICON } from "../components/icons";
import { PersonChip } from "../components/profile/ProfileDrawer";
import { useToast } from "../components/Toast";
import { TrustBadge } from "../components/TrustBadge";
import { DOC_TYPE_LABEL, claimLabel, claimValue, formatDate, plural } from "../lib/format";
import { status } from "../theme/tokens";
import { useClientContext } from "./ClientLayout";

/** Client page in the one-pager language: the full grid, then the ↔ record lane and the ↕ across-clients lane. */
export function ClientRecordPage() {
  const { record, conflicts, vertical, refresh } = useClientContext();
  const { toast } = useToast();
  const location = useLocation();
  const [active, setActive] = useState<Conflict | null>(null);
  const c = record.client;
  const pending = conflicts.filter((x) => x.resolution === "pending");

  useEffect(() => {
    if (!location.hash) return;
    const el = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [location.hash]);

  const docs = docsFromRecord(record, conflicts);
  const facts = record.claims.filter((x) => x.status === "active");

  return (
    <div className="space-y-6">
      <section aria-label="TrustGrid map" className="rounded-3xl border border-borderSubtle bg-surface p-5 shadow-soft">
        <p className="mb-3 text-body-xs text-textStrong">
          <span className="font-bold text-ink">{c.name}</span> across time <span className="font-bold text-hz">↔</span>, against every other client <span className="font-bold text-vt">↕</span>. The red item is
          whatever you work on next.
        </p>
        <GridMap clientName={c.name} docs={docs} cases={vertical?.similar_cases ?? []} newItemLabel="Next item" />
      </section>

      {pending.length > 0 && (
        <section id="conflicts" aria-labelledby="conflicts-title" className="scroll-mt-20 rounded-3xl border border-danger-bold/30 bg-surface p-5 shadow-soft">
          <h2 id="conflicts-title" className="flex items-center gap-2 text-heading-xxs font-bold text-ink">
            <OctagonAlert aria-hidden="true" className="size-5 text-danger-text" /> Open conflicts ({pending.length})
          </h2>
          <ul className="mt-4 space-y-4">
            {pending.map((cf) => (
              <li key={cf.id} className="rounded-2xl border border-borderSubtle p-4">
                <ConflictCompare conflict={cf} />
                {c.can_edit && (
                  <button type="button" className="btn-secondary mt-3" onClick={() => setActive(cf)}>
                    Resolve conflict
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <div id="lane-hz" className="scroll-mt-20">
          <Lane dim="horizontal" id="hz-title" title={`${c.name}'s record`} status={{ status: pending.length ? "conflict" : "consistent", headline: `${plural(record.timeline.length, "document")} · ${plural(facts.length, "fact")}` }}>
            {facts.length > 0 && (
              <div>
                <h4 className="mb-2 text-caption font-bold uppercase tracking-eyebrow text-textMuted">Facts</h4>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {facts.map((f) => (
                    <li key={f.id} className="rounded-xl bg-surface p-3">
                      <p className="text-caption font-semibold text-textMuted">{claimLabel(f.key)}</p>
                      <p className="text-body-s font-extrabold text-heading">{claimValue(f.value, f.unit)}</p>
                      <p className={`mt-1 inline-flex items-center gap-1 text-caption font-semibold ${f.evidence_count >= 2 ? "text-success-text" : "text-textMuted"}`}>
                        <Link2 aria-hidden="true" className="size-3.5" /> Confirmed by {plural(f.evidence_count, "document")}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <h4 className="mb-2 text-caption font-bold uppercase tracking-eyebrow text-textMuted">Timeline</h4>
              <ol className="space-y-2">
                {record.timeline.map((d) => {
                  const Icon = DOC_TYPE_ICON[d.type];
                  const touched = docs.find((x) => x.id === d.document_id)?.kind;
                  return (
                    <li key={d.document_id} id={`doc-${d.document_id}`} className="scroll-mt-20 rounded-xl bg-surface p-3">
                      <div className="flex items-start gap-3">
                        <span aria-hidden="true" className={`inline-flex size-8 shrink-0 items-center justify-center rounded-lg ${touched === "conflict" ? "bg-danger-subtle text-danger-text" : "bg-hz-soft text-hz"}`}>
                          <Icon className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-body-xs font-bold text-ink">{d.title}</p>
                          <p className="text-caption text-textMuted">
                            {DOC_TYPE_LABEL[d.type]} · {formatDate(d.date)}
                            {d.linked_duplicate_count > 0 ? ` · +${plural(d.linked_duplicate_count, "linked copy", "linked copies")}` : ""}
                          </p>
                          <p className="mt-1 line-clamp-2 text-caption text-text">{d.excerpt}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <PersonChip person={d.author} />
                            <TrustBadge trust={d.trust} expandable />
                            {d.suspicious && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-danger-subtle px-2 py-0.5 text-caption font-bold text-danger-text" title={d.suspicious_reason ?? undefined}>
                                {(() => {
                                  const I = STATUS_ICON[status.link.suspicious.icon];
                                  return <I aria-hidden="true" className="size-3.5" />;
                                })()}
                                {status.link.suspicious.label}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
            <div>
              <h4 className="mb-2 text-caption font-bold uppercase tracking-eyebrow text-textMuted">Knows this client</h4>
              <div className="flex flex-wrap gap-1.5">
                {record.people.map((p) => (
                  <PersonChip key={p.person.id} person={p.person} showRole />
                ))}
              </div>
            </div>
          </Lane>
        </div>
        <div id="lane-vt" className="scroll-mt-20">
          <Lane dim="vertical" id="vt-title" status={vertical?.vertical ?? null}>
            {(vertical?.similar_cases ?? []).map((s) => (
              <SimilarCaseItem key={s.dossier_item_id} c={s} />
            ))}
            {!vertical?.similar_cases.length && <p className="text-caption text-textMuted">No similar cases at other clients yet.</p>}
            {vertical && vertical.problem_experts.length > 0 && (
              <div>
                <h4 className="mb-2 text-caption font-bold uppercase tracking-eyebrow text-textMuted">Solved it elsewhere</h4>
                <ExpertsList record={null} problem={vertical.problem_experts} context={c.name} compact />
              </div>
            )}
          </Lane>
        </div>
      </div>

      {active && (
        <ConflictModal
          conflict={active}
          onClose={() => setActive(null)}
          onResolve={async (body) => {
            await api.resolveConflict(active.id, body);
            setActive(null);
            toast({ title: "Conflict resolved", detail: "Your decision is saved with your name." });
            refresh();
          }}
        />
      )}
    </div>
  );
}
