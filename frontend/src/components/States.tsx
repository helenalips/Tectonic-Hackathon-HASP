import { CircleAlert, Inbox, LoaderCircle, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({ title, children, icon: Icon = Inbox }: { title: string; children?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border bg-backgroundAlt px-6 py-8 text-center">
      <Icon aria-hidden="true" className="size-6 text-iconMuted" />
      <p className="text-body-s font-semibold text-textStrong">{title}</p>
      {children && <div className="text-body-xs text-textMuted">{children}</div>}
    </div>
  );
}

export function ErrorState({ message = "Something went wrong. Try again in a moment.", onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-md border-l-4 border-danger-bold bg-danger-subtle px-4 py-4 sm:flex-row sm:items-center">
      <CircleAlert aria-hidden="true" className="size-5 shrink-0 text-danger-text" />
      <p className="flex-1 text-body-s text-textStrong">{message}</p>
      {onRetry && (
        <button type="button" className="btn-secondary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 py-8 text-body-s text-textMuted">
      <LoaderCircle aria-hidden="true" className="size-5 animate-spin text-primary" />
      <span>{label}…</span>
    </div>
  );
}
