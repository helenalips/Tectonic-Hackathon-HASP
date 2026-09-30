import { useEffect, useRef, useState } from "react";
import { api, errorMessage } from "../../api/client";
import type { Channel, CheckResult } from "../../api/types";

export interface DraftCheckState {
  result: CheckResult | null;
  loading: boolean;
  preview: boolean;
  error: string | null;
  /** Text the current result belongs to. */
  checkedText: string;
}

/** Debounced live check (POST /check) of a draft as the user types. Ignores stale responses. */
export function useDraftCheck(clientId: string | null, text: string, opts: { subject?: string; channel?: Channel; delay?: number; minLength?: number } = {}): DraftCheckState & { recheck: () => void } {
  const { subject, channel = "email", delay = 600, minLength = 12 } = opts;
  const [state, setState] = useState<DraftCheckState>({ result: null, loading: false, preview: false, error: null, checkedText: "" });
  const seq = useRef(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const trimmed = text.trim();
    const id = ++seq.current;
    if (!clientId || trimmed.length < minLength) {
      setState({ result: null, loading: false, preview: false, error: null, checkedText: "" });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    const timer = window.setTimeout(() => {
      api
        .check({ client_id: clientId, channel, text: trimmed, ...(subject?.trim() ? { subject: subject.trim() } : {}) })
        .then(({ result, preview }) => id === seq.current && setState({ result, preview, loading: false, error: null, checkedText: text }))
        .catch((e) => id === seq.current && setState((s) => ({ ...s, loading: false, error: errorMessage(e) })));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [clientId, text, subject, channel, delay, minLength, tick]);

  return { ...state, recheck: () => setTick((t) => t + 1) };
}
