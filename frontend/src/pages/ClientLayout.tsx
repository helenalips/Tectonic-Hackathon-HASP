import { FileCheck, LayoutList, MessageSquareText, PenLine, type LucideIcon } from "lucide-react";
import { NavLink, Outlet, useOutletContext, useParams } from "react-router-dom";
import { api, ApiError, CLIENT_ID_PATTERN, errorMessage } from "../api/client";
import type { CheckResult, ClientRecord, Conflict } from "../api/types";
import { SignatureRule } from "../components/grid/TrustGridMark";
import { DemoDataTag } from "../components/DemoDataTag";
import { ErrorState, Loading } from "../components/States";
import { useClients } from "../lib/clients";
import { useAsync } from "../lib/useAsync";
import { NotFoundPage } from "./NotFoundPage";

export interface ClientContext {
  record: ClientRecord;
  conflicts: Conflict[];
  /** Vertical view of the whole record: similar cases at other clients (POST /check on the record's open topics). */
  vertical: CheckResult | null;
  /** Refetch the record, conflicts and the client list (header counts). */
  refresh: () => void;
}

export const useClientContext = () => useOutletContext<ClientContext>();

const SEGMENT_LABEL: Record<string, string> = { mid_market: "Mid-market", enterprise: "Enterprise", global: "Global" };

const TABS: { to: string; label: string; icon: LucideIcon; end?: boolean; edit?: boolean }[] = [
  { to: "", label: "Record", icon: LayoutList, end: true },
  { to: "new-event", label: "Capture new event", icon: PenLine, edit: true },
  { to: "ask", label: "Ask a question", icon: MessageSquareText },
  { to: "solution", label: "Build solution", icon: FileCheck, edit: true },
];

export function ClientLayout() {
  const { clientId = "" } = useParams();
  const valid = CLIENT_ID_PATTERN.test(clientId);
  const { reload: reloadClients } = useClients();
  const state = useAsync(async () => {
    if (!valid) throw new ApiError(404, "Not found");
    const [record, conflicts] = await Promise.all([
      api.client(clientId),
      api.conflicts({ client_id: clientId, status: "pending" }).catch(() => [] as Conflict[]),
    ]);
    const topics = [record.summary, ...record.dossier_items.map((d) => `${d.title}. ${d.description}`)].join("\n").slice(0, 4000);
    const vertical = await api
      .check({ client_id: clientId, channel: "note", text: topics || record.client.name })
      .then((r) => r.result)
      .catch(() => null);
    return { record, conflicts, vertical };
  }, [clientId]);

  if (!valid || (state.error instanceof ApiError && state.error.status === 404)) return <NotFoundPage />;
  if (state.loading && !state.data) return <Loading label="Loading client record" />;
  if (state.error || !state.data) return <ErrorState message={errorMessage(state.error)} onRetry={state.reload} />;

  const { record, conflicts, vertical } = state.data;
  const c = record.client;
  const refresh = () => {
    state.reload();
    reloadClients();
  };

  return (
    <div className="space-y-6">
      <header>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-caption font-bold uppercase tracking-eyebrow text-hz">Client record</p>
          {c.demo_data && <DemoDataTag />}
        </div>
        <h1 className="mt-1 font-display text-display-l font-extrabold tracking-tightest text-ink">{c.name}</h1>
        <p className="mt-2 text-body-s text-textMuted">
          {[c.country, c.sector, SEGMENT_LABEL[c.segment] ?? c.segment].filter(Boolean).join(" · ")}
          {!c.can_edit && " · Read only: you are not assigned to this client"}
        </p>
        <SignatureRule className="mt-4 max-w-md" />
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <a href="#lane-hz" className={`rounded-2xl border-l-4 border-hz bg-hz-subtle p-5 transition-shadow hover:shadow-soft`}>
            <p className="text-caption font-bold uppercase tracking-eyebrow text-hz">↔ Horizontal · consistency</p>
            <p className="mt-1 font-display text-heading-l font-extrabold tracking-tightest text-ink">
              {record.consistency.open_conflicts === 0 ? "Consistent" : `${record.consistency.open_conflicts} open ${record.consistency.open_conflicts === 1 ? "conflict" : "conflicts"}`}
            </p>
            <p className="mt-1 text-caption text-textStrong">
              {record.timeline.length} documents · {record.claims.filter((x) => x.status === "active").length} facts · {record.consistency.linked_duplicates} duplicates linked as confirmation
            </p>
          </a>
          <a href="#lane-vt" className="rounded-2xl border-l-4 border-vt bg-vt-subtle p-5 transition-shadow hover:shadow-soft">
            <p className="text-caption font-bold uppercase tracking-eyebrow text-vt">↕ Vertical · links across clients</p>
            <p className="mt-1 font-display text-heading-l font-extrabold tracking-tightest text-ink">
              {vertical ? `${new Set(vertical.similar_cases.map((x) => x.client_label)).size} clients` : "–"}
            </p>
            <p className="mt-1 text-caption text-textStrong">{vertical ? vertical.vertical.headline : "Similar cases are not available right now."}</p>
          </a>
        </div>
        <nav aria-label="Client views" className="mt-5 flex flex-wrap gap-2">
          {TABS.filter((t) => !t.edit || c.can_edit).map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={label}
              to={to}
              end={end}
              className={({ isActive }) =>
                `chip ${isActive ? "border-hz bg-hz-soft text-heading hover:text-heading" : ""}`
              }
            >
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <Outlet context={{ record, conflicts, vertical, refresh } satisfies ClientContext} />
    </div>
  );
}
