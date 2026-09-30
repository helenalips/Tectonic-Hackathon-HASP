import { CircleCheck, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

interface ToastItem {
  id: number;
  title: string;
  detail?: string;
  tone: "success" | "info";
}

interface ToastApi {
  toast: (t: Omit<ToastItem, "id" | "tone"> & { tone?: ToastItem["tone"] }) => void;
}

const ToastContext = createContext<ToastApi>({ toast: () => undefined });
export const useToast = () => useContext(ToastContext);

/** Bottom-centre toasts, announced politely to screen readers. Auto-dismiss after 4.5 s. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(1);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const toast = useCallback<ToastApi["toast"]>(
    (t) => {
      const id = seq.current++;
      setItems((xs) => [...xs.slice(-2), { id, tone: "success", ...t }]);
      window.setTimeout(() => dismiss(id), 4500);
    },
    [dismiss],
  );
  const api = useMemo(() => ({ toast }), [toast]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-[70] flex flex-col items-center gap-2 px-4">
        {items.map((t) => {
          const Icon = t.tone === "success" ? CircleCheck : Info;
          return (
            <div key={t.id} role="status" className="animate-pop pointer-events-auto flex max-w-lg items-start gap-3 rounded-xl bg-ink px-4 py-3 text-surface shadow-pop">
              <Icon aria-hidden="true" className={`mt-0.5 size-5 shrink-0 ${t.tone === "success" ? "text-success-soft" : "text-info-soft"}`} />
              <div className="min-w-0">
                <p className="text-body-xs font-bold">{t.title}</p>
                {t.detail && <p className="text-caption text-surface/80">{t.detail}</p>}
              </div>
              <button type="button" className="-mr-1 rounded p-1 text-surface/80 hover:text-surface" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
