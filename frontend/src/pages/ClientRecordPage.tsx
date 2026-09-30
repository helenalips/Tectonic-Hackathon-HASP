import { BookOpen, ChevronDown, FileCheck, FolderOpen, Gauge, History, Link2, MessageSquareText, OctagonAlert, Users } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../api/client";
import type { ClaimView, Conflict, PersonContribution, TimelineItem } from "../api/types";
import { ConflictCompare } from "../components/ConflictCompare";
import { ConflictModal } from "../components/ConflictModal";
import { Donut } from "../components/Donut";
import { ExpertCard } from "../components/ExpertCard";
import { DOC_TYPE_ICON, STATUS_ICON } from "../components/icons";
import { ProgressBar } from "../components/ProgressBar";
import { DimensionLabel, SectionHeader } from "../components/SectionHeader";
import { EmptyState } from "../components/States";
import { Tag } from "../components/Tag";
import { TrustBadge } from "../components/TrustBadge";
import { status } from "../theme/tokens";
import { CATEGORY_LABEL, DOC_TYPE_LABEL, claimLabel, claimValue, formatDate, formatHours, initials, plural, sentenceCase } from "../lib/format";
import { factsConfirmedShare, recordTrust, reliableDocsShare } from "../lib/metrics";
import { useClientContext } from "./ClientLayout";

function TimelineEntry({ item }: { item: TimelineItem }) {
  const Icon = DOC_TYPE_ICON[item.type];
  const suspicious = status.link.suspicious;
  return (
    <li id={`doc-${item.document_id}`} tabIndex={-1} className="relative scroll-mt-24 pb-6 pl-14 last:pb-0">
      <span aria-hidden="true" className="absolute left-5 top-10 bottom-0 w-px bg-borderSubtle" />
      <span aria-hidden="true" className="absolute left-0 top-0 inline-flex size-10 items-center justify-center rounded-full bg-primarySubtle text-primaryPressed">
        <Icon className="size-5" />
      </span>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-sans text-body-s font-semibold text-textStrong">{item.title}</h3>
          <p className="mt-0.5 text-body-xs text-textMuted">
            {DOC_TYPE_LABEL[item.type]} · {item.author.name} · <time dateTime={item.date}>{formatDate(item.date)}</time>
            {item.owner ? "" : " · No owner"}
          </p>
        </div>
      </div>
      <p className="mt-2 text-body-s text-text">{item.excerpt}</p>
      <div className="mt-3 flex flex-wrap items-start gap-2">
        <TrustBadge trust={item.trust} expandable />
        {item.suspicious && (
          <Tag tone={suspicious.tone} icon={STATUS_ICON[suspicious.icon]} title={item.suspicious_reason ?? undefined}>
            {suspicious.label}
          </Tag>
        )}
        {item.linked_duplicate_count > 0 && (
          <Tag tone="info" icon={Link2}>
            +{plural(item.linked_duplicate_count, "linked copy", "linked copies")}
          </Tag>
        )}
      </div>
      {item.suspicious && item.suspicious_reason && <p className="mt-2 text-body-xs text-danger-text">{item.suspicious_reason}</p>}
    </li>
  );
}

function ClaimRow({ claim }: { claim: ClaimView }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  return (
    <li className="rounded-md border border-borderSubtle p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-body-xs font-semibold text-textMuted">{claimLabel(claim.key)}</p>
          <p className="font-display text-heading-xs font-bold text-heading">{claimValue(claim.value, claim.unit)}</p>
          <p className="mt-0.5 text-body-xs text-textMuted">Valid from {formatDate(claim.valid_from)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {claim.status === "superseded" && <Tag tone="neutral">Superseded</Tag>}
          <TrustBadge trust={claim.trust} />
        </div>
      </div>
      <button
        type="button"
        className="mt-3 inline-flex items-center gap-1.5 rounded text-body-xs font-semibold text-info-text hover:underline"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <Link2 aria-hidden="true" className="size-4" />
        Confirmed by {plural(claim.evidence_count, "document")}
        <ChevronDown aria-hidden="true" className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul id={listId} className="mt-3 space-y-2 border-l-2 border-primaryTint pl-4">
          {claim.evidence.map((e) => (
            <li key={`${e.document_id}-${e.added_at}`} className="text-body-xs">
              <span className="font-semibold text-textStrong">{e.title}</span>
              <span className="text-textMuted">
                {" "}
                · {e.author.name} · {formatDate(e.added_at)} · {e.relation === "origin" ? "First stated" : "Confirmation"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function PersonRow({ p }: { p: PersonContribution }) {
  return (
    <li className="flex gap-3 py-3">
      <span aria-hidden="true" className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primaryTint font-display text-body-xs font-bold text-navy">
        {initials(p.person.name)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
          <p className="text-body-s font-semibold text-textStrong">{p.person.name}</p>
          <p className="text-body-xs font-semibold tabular-nums text-heading">{formatHours(p.hours)}</p>
        </div>
        <p className="text-body-xs text-textMuted">
          {p.person.role} · {formatDate(p.first_date)} – {formatDate(p.last_date)}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {p.domains.map((d) => (
            <Tag key={d} tone="neutral">
              {sentenceCase(d.replace(/_/g, " "))}
            </Tag>
          ))}
        </div>
        <div className="mt-2">
          <ProgressBar value={p.reliability.score / 100} tone="ink" compact caption="Reliability" label={`Reliability of ${p.person.name}`} />
          {p.reliability.reasons.length > 0 && <p className="mt-1 text-body-xs text-textMuted">{p.reliability.reasons.join(" · ")}</p>}
        </div>
      </div>
    </li>
  );
}

export function ClientRecordPage() {
  const { record, conflicts, refresh } = useClientContext();
  const [active, setActive] = useState<Conflict | null>(null);
  const location = useLocation();
  const c = record.client;
  const base = `/clients/${encodeURIComponent(c.id)}`;
  const trust = recordTrust(record);
  const confirmed = factsConfirmedShare(record);
  const reliable = reliableDocsShare(record);
  const within = conflicts.filter((x) => x.scope === "within_record");
  const across = conflicts.filter((x) => x.scope === "across_records");

  // Scroll to #conflicts / #doc-… links from the dashboard.
  useEffect(() => {
    if (!location.hash) return;
    const el = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (el) {
      el.scrollIntoView({ block: "start" });
      if (el.tabIndex >= 0 || el.getAttribute("tabindex") === "-1") el.focus({ preventScroll: true });
    }
  }, [location.hash]);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <section aria-labelledby="summary" className="card lg:col-span-2">
          <SectionHeader icon={BookOpen} id="summary" title="Summary" subtitle={<DimensionLabel dimension="record" />} />
          <p className="text-body text-text">{record.summary}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            {c.can_edit ? (
              <Link to={`${base}/new-event`} className="btn-primary">
                Capture new event
              </Link>
            ) : (
              <p className="text-body-s text-textMuted">You can read this record. Only assigned consultants can add to it.</p>
            )}
            <Link to={`${base}/ask`} className="btn-secondary">
              <MessageSquareText aria-hidden="true" className="size-4" />
              Ask a question
            </Link>
          </div>
        </section>

        <section aria-labelledby="record-health" className="card">
          <SectionHeader icon={Gauge} id="record-health" title="Record health" level={3} />
          <div className="flex flex-col items-center gap-5">
            <Donut value={trust} centre={trust === null ? "–" : String(trust)} caption="/ 100 trust" label={trust === null ? "No documents yet" : `Average document trust ${trust} of 100`} />
            <div className="w-full space-y-3">
              {confirmed !== null && <ProgressBar value={confirmed} tone="good" caption="Facts confirmed by 2+ documents" label="Facts confirmed by 2 or more documents" />}
              {reliable !== null && <ProgressBar value={reliable} tone="brand" caption="Documents rated Reliable" label="Documents rated Reliable" />}
            </div>
          </div>
        </section>
      </div>

      {conflicts.length > 0 && (
        <section id="conflicts" tabIndex={-1} aria-labelledby="conflicts-title" className="card scroll-mt-24">
          <SectionHeader icon={OctagonAlert} id="conflicts-title" title="Open conflicts" subtitle={`${plural(conflicts.length, "conflict")} to resolve`} />
          <ul className="space-y-6">
            {[...within, ...across].map((cf) => (
              <li key={cf.id} className="border-t border-borderSubtle pt-5 first:border-0 first:pt-0">
                <ConflictCompare conflict={cf} />
                {c.can_edit && (
                  <button type="button" className="btn-secondary mt-4" onClick={() => setActive(cf)}>
                    Resolve conflict
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section id="timeline" aria-labelledby="timeline-title" className="card scroll-mt-24">
            <SectionHeader
              icon={History}
              id="timeline-title"
              title="Timeline"
              subtitle={<DimensionLabel dimension="record" />}
              actions={<span className="text-body-xs text-textMuted">Newest first · {plural(record.timeline.length, "document")}</span>}
            />
            {record.timeline.length === 0 ? (
              <EmptyState title="No documents yet">Capture a meeting, email or note to start this record.</EmptyState>
            ) : (
              <ol>
                {record.timeline.map((item) => (
                  <TimelineEntry key={item.document_id} item={item} />
                ))}
              </ol>
            )}
          </section>

          <section aria-labelledby="facts-title" className="card">
            <SectionHeader icon={Link2} id="facts-title" title="Facts" subtitle="One entry per fact. Duplicates count as confirmations." />
            {record.claims.length === 0 ? (
              <EmptyState title="No facts extracted yet" />
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {record.claims.map((cl) => (
                  <ClaimRow key={cl.id} claim={cl} />
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="dossier-title" className="card">
            <SectionHeader icon={FolderOpen} id="dossier-title" title="Dossier items" subtitle="Questions, requests and problems for this client" />
            {record.dossier_items.length === 0 ? (
              <EmptyState title="No dossier items yet" />
            ) : (
              <ul className="space-y-3">
                {record.dossier_items.map((d) => (
                  <li key={d.id} className="rounded-md border border-borderSubtle p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Tag tone="neutral">{CATEGORY_LABEL[d.category] ?? d.category}</Tag>
                      {d.status === "open" ? (
                        <Tag tone="info">Open</Tag>
                      ) : (
                        <Tag tone="success" icon={STATUS_ICON["check-circle"]}>
                          Resolved
                        </Tag>
                      )}
                    </div>
                    <h3 className="mt-2 font-sans text-body-s font-semibold text-textStrong">{d.title}</h3>
                    <p className="mt-1 text-body-s text-text">{d.description}</p>
                    {d.resolution && (
                      <p className="mt-2 text-body-s text-text">
                        <span className="font-semibold text-textStrong">Resolution: </span>
                        {d.resolution}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-body-xs text-textMuted">
                        Opened by {d.created_by.name} on {formatDate(d.created_at)} · {plural(d.linked_document_ids.length, "linked document")}
                      </p>
                      {c.can_edit && d.status === "open" && (
                        <Link to={`${base}/solution?item=${encodeURIComponent(d.id)}`} className="chip">
                          <FileCheck aria-hidden="true" className="size-4" />
                          Build solution
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section aria-labelledby="experts-title">
            <SectionHeader icon={Users} id="experts-title" title="Who to ask" />
            <div className="space-y-4">
              {record.experts.record_expert && <ExpertCard expert={record.experts.record_expert} context={c.name} />}
              {record.experts.problem_expert && <ExpertCard expert={record.experts.problem_expert} context={c.name} />}
              {!record.experts.record_expert && !record.experts.problem_expert && <EmptyState title="No expert found yet" />}
            </div>
          </section>

          <section aria-labelledby="people-title" className="card">
            <SectionHeader icon={Users} id="people-title" title="People on this record" level={3} />
            {record.people.length === 0 ? (
              <EmptyState title="No contributors yet" />
            ) : (
              <ul className="divide-y divide-borderSubtle">
                {record.people.map((p) => (
                  <PersonRow key={p.person.id} p={p} />
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {active && (
        <ConflictModal
          conflict={active}
          onClose={() => setActive(null)}
          onResolve={async (body) => {
            await api.resolveConflict(active.id, body);
            setActive(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
