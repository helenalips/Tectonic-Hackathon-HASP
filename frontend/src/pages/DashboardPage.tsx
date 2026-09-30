import { Activity, Building2, ChevronRight, CopyCheck, Gauge, MessageSquareText, OctagonAlert, PenLine, FileCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../api/client";
import type { ClientRecord, ClientSummary } from "../api/types";
import { ConsistencyStatus } from "../components/ConsistencyStatus";
import { DemoDataTag } from "../components/DemoDataTag";
import { Donut } from "../components/Donut";
import { DOC_TYPE_ICON } from "../components/icons";
import { ProgressBar } from "../components/ProgressBar";
import { IconBadge, SectionHeader } from "../components/SectionHeader";
import { EmptyState, ErrorState, Loading } from "../components/States";
import { TrustBadge } from "../components/TrustBadge";
import { useAuth } from "../lib/auth";
import { DOC_TYPE_LABEL, formatDate, plural } from "../lib/format";
import { factsConfirmedShare, recordTrust, reliableDocsShare } from "../lib/metrics";
import { useAsync } from "../lib/useAsync";

interface DashboardData {
  clients: ClientSummary[];
  records: ClientRecord[];
}

function Kpi({ icon, label, value, hint }: { icon: typeof Gauge; label: string; value: string; hint?: string }) {
  return (
    <div className="card flex items-center gap-4 p-5">
      <IconBadge icon={icon} />
      <div className="min-w-0">
        <p className="font-display text-heading-m font-bold text-heading tabular-nums">{value}</p>
        <p className="text-body-xs text-textMuted">
          {label}
          {hint && <span className="sr-only">. {hint}</span>}
        </p>
      </div>
    </div>
  );
}

function ClientCard({ record }: { record: ClientRecord }) {
  const c = record.client;
  const trust = recordTrust(record);
  const confirmed = factsConfirmedShare(record);
  const reliable = reliableDocsShare(record);
  const base = `/clients/${encodeURIComponent(c.id)}`;
  return (
    <article className="card flex flex-col gap-5" aria-labelledby={`client-${c.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`client-${c.id}`} className="text-heading-xs font-bold">
            <Link to={base} className="hover:underline">
              {c.name}
            </Link>
          </h3>
          <p className="mt-1 text-body-xs text-textMuted">
            {c.country} · {c.sector}
          </p>
        </div>
        {c.demo_data && <DemoDataTag />}
      </div>

      <div className="flex flex-col items-center gap-6 sm:flex-row">
        <Donut
          value={trust}
          centre={trust === null ? "–" : String(trust)}
          caption="/ 100 trust"
          label={trust === null ? "No documents yet" : `Average document trust ${trust} of 100`}
        />
        <div className="w-full min-w-0 flex-1 space-y-4">
          <ConsistencyStatus status={record.consistency} variant="inline" />
          {confirmed !== null && <ProgressBar value={confirmed} tone="good" caption="Facts confirmed by 2+ documents" label="Facts confirmed by 2 or more documents" />}
          {reliable !== null && <ProgressBar value={reliable} tone="brand" caption="Documents rated Reliable" label="Documents rated Reliable" />}
        </div>
      </div>

      <nav aria-label={`Quick actions for ${c.name}`} className="flex flex-wrap gap-2">
        {record.consistency.open_conflicts > 0 && (
          <Link to={`${base}#conflicts`} className="chip">
            <OctagonAlert aria-hidden="true" className="size-4 text-danger-text" />
            {plural(record.consistency.open_conflicts, "open conflict")}
          </Link>
        )}
        {record.consistency.linked_duplicates > 0 && (
          <Link to={`${base}#timeline`} className="chip">
            <CopyCheck aria-hidden="true" className="size-4 text-info-bold" />
            {plural(record.consistency.linked_duplicates, "linked duplicate")}
          </Link>
        )}
        <Link to={`${base}/ask`} className="chip">
          <MessageSquareText aria-hidden="true" className="size-4" />
          Ask a question
        </Link>
        {c.can_edit && (
          <Link to={`${base}/solution`} className="chip">
            <FileCheck aria-hidden="true" className="size-4" />
            Build solution
          </Link>
        )}
      </nav>
    </article>
  );
}

export function DashboardPage() {
  const { me } = useAuth();
  const state = useAsync<DashboardData>(async () => {
    const clients = await api.clients();
    const mine = me && me.role === "consultant" ? clients.filter((c) => me.assigned_client_ids.includes(c.id)) : clients;
    const settled = await Promise.allSettled(mine.map((c) => api.client(c.id)));
    const records = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    return { clients, records };
  }, [me?.user_id]);

  const firstName = me?.person.name.split(" ")[0] ?? "";

  if (state.loading && !state.data) return <Loading label="Loading your clients" />;
  if (state.error || !state.data) return <ErrorState message={errorMessage(state.error)} onRetry={state.reload} />;

  const { clients, records } = state.data;
  const openConflicts = records.reduce((s, r) => s + r.consistency.open_conflicts, 0);
  const linked = records.reduce((s, r) => s + r.consistency.linked_duplicates, 0);
  const trusts = records.map(recordTrust).filter((t): t is number => t !== null);
  const avgTrust = trusts.length ? Math.round(trusts.reduce((a, b) => a + b, 0) / trusts.length) : null;
  const mostUrgent = [...records].sort((a, b) => b.consistency.open_conflicts - a.consistency.open_conflicts)[0];

  const activity = records
    .flatMap((r) => r.timeline.map((d) => ({ doc: d, client: r.client })))
    .sort((a, b) => b.doc.date.localeCompare(a.doc.date))
    .slice(0, 6);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-heading-l font-bold">Hi {firstName},</h1>
          <p className="mt-2 text-body text-textMuted">Here's what needs your attention across your clients.</p>
        </div>
        {mostUrgent && mostUrgent.consistency.open_conflicts > 0 && (
          <Link to={`/clients/${encodeURIComponent(mostUrgent.client.id)}#conflicts`} className="btn-primary">
            Review open conflicts
          </Link>
        )}
      </div>

      <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Building2} label={records.length === 1 ? "Client" : "Clients"} value={String(records.length)} />
        <Kpi icon={OctagonAlert} label={openConflicts === 1 ? "Open conflict" : "Open conflicts"} value={String(openConflicts)} />
        <Kpi icon={CopyCheck} label="Duplicates linked" value={String(linked)} />
        <Kpi icon={Gauge} label="Average trust" value={avgTrust === null ? "–" : String(avgTrust)} hint="Out of 100" />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section aria-labelledby="your-records" className="space-y-4 lg:col-span-2">
          <SectionHeader icon={Building2} id="your-records" title="Your client records" subtitle="Consistency and trust per client" />
          {records.length === 0 ? (
            <EmptyState title="No clients assigned to you yet" />
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {records.map((r) => (
                <ClientCard key={r.client.id} record={r} />
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <section aria-labelledby="your-clients" className="card">
            <SectionHeader icon={Building2} id="your-clients" title="Your clients" level={3} />
            <ul className="-mx-2">
              {clients.map((c) => (
                <li key={c.id}>
                  <Link to={`/clients/${encodeURIComponent(c.id)}`} className="flex items-center gap-3 rounded-md px-2 py-2.5 hover:bg-background">
                    <Building2 aria-hidden="true" className="size-4 shrink-0 text-iconMuted" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-s font-medium text-textStrong">{c.name}</span>
                      <span className="block text-body-xs text-textMuted">
                        {c.can_edit ? "Assigned" : "Read only"}
                        {c.open_conflicts > 0 ? ` · ${plural(c.open_conflicts, "open conflict")}` : " · Consistent"}
                      </span>
                    </span>
                    <ChevronRight aria-hidden="true" className="size-4 text-iconMuted" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="recent-activity" className="card">
            <SectionHeader icon={Activity} id="recent-activity" title="Recent activity" level={3} />
            {activity.length === 0 ? (
              <EmptyState title="No activity yet" />
            ) : (
              <ul className="-mx-2">
                {activity.map(({ doc, client }) => {
                  const Icon = DOC_TYPE_ICON[doc.type] ?? PenLine;
                  return (
                    <li key={doc.document_id}>
                      <Link to={`/clients/${encodeURIComponent(client.id)}#doc-${doc.document_id}`} className="flex items-start gap-3 rounded-md px-2 py-2.5 hover:bg-background">
                        <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-iconMuted" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-body-s font-medium text-textStrong">{doc.title}</span>
                          <span className="block text-body-xs text-textMuted">
                            {DOC_TYPE_LABEL[doc.type]} · {client.name} · {formatDate(doc.date)}
                          </span>
                          <TrustBadge trust={doc.trust} className="mt-1.5" />
                        </span>
                        <ChevronRight aria-hidden="true" className="mt-0.5 size-4 text-iconMuted" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
