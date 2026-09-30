import { FileCheck, LayoutList, MessageSquareText, PenLine, type LucideIcon } from "lucide-react";
import { NavLink, Outlet, useOutletContext, useParams } from "react-router-dom";
import { api, ApiError, CLIENT_ID_PATTERN, errorMessage } from "../api/client";
import type { ClientRecord, Conflict } from "../api/types";
import { ConsistencyStatus } from "../components/ConsistencyStatus";
import { DemoDataTag } from "../components/DemoDataTag";
import { ErrorState, Loading } from "../components/States";
import { useClients } from "../lib/clients";
import { useAsync } from "../lib/useAsync";
import { NotFoundPage } from "./NotFoundPage";

export interface ClientContext {
  record: ClientRecord;
  conflicts: Conflict[];
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
    return { record, conflicts };
  }, [clientId]);

  if (!valid || (state.error instanceof ApiError && state.error.status === 404)) return <NotFoundPage />;
  if (state.loading && !state.data) return <Loading label="Loading client record" />;
  if (state.error || !state.data) return <ErrorState message={errorMessage(state.error)} onRetry={state.reload} />;

  const { record, conflicts } = state.data;
  const c = record.client;
  const refresh = () => {
    state.reload();
    reloadClients();
  };

  return (
    <div className="space-y-6">
      <header className="card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-heading-l font-bold">{c.name}</h1>
              {c.demo_data && <DemoDataTag />}
            </div>
            <p className="mt-2 text-body-s text-textMuted">
              {[c.country, c.sector, SEGMENT_LABEL[c.segment] ?? c.segment].filter(Boolean).join(" · ")}
              {!c.can_edit && " · Read only: you are not assigned to this client"}
            </p>
          </div>
        </div>
        <div className="mt-5">
          <ConsistencyStatus status={record.consistency} />
        </div>
        <nav aria-label="Client views" className="mt-5 flex flex-wrap gap-2">
          {TABS.filter((t) => !t.edit || c.can_edit).map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={label}
              to={to}
              end={end}
              className={({ isActive }) =>
                `chip ${isActive ? "border-primary bg-primaryTint text-navy hover:text-navy" : ""}`
              }
            >
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <Outlet context={{ record, conflicts, refresh } satisfies ClientContext} />
    </div>
  );
}
