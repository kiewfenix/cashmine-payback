import { useCallback, useEffect, useRef, useState } from "react";

export interface Resource<T> {
  /** Last good data; kept when a later refresh fails. */
  data: T | null;
  /** Error from the latest request, or null once a request succeeds. */
  error: unknown;
  /** No data yet and a request in flight. */
  loading: boolean;
  /** Data on screen and a request in flight. */
  refreshing: boolean;
  /** Client time of the last successful load. */
  loadedAt: number | null;
  refetch: () => Promise<void>;
}

export interface ResourceOptions {
  /** Re-load every N ms while the page is visible. */
  pollMs?: number;
  enabled?: boolean;
}

function isPageVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

/** Loads something cancellable, keeps the last good value, optionally polls while the page is visible. */
export function useResource<T>(load: (signal: AbortSignal) => Promise<T>, options: ResourceOptions = {}): Resource<T> {
  const { pollMs, enabled = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [inFlight, setInFlight] = useState(false);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  const run = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setInFlight(true);
    try {
      const next = await loadRef.current(controller.signal);
      if (controller.signal.aborted) return;
      setData(next);
      setError(null);
      setLoadedAt(Date.now());
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(caught);
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setInFlight(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void run();
    return () => controllerRef.current?.abort();
  }, [enabled, load, run]);

  useEffect(() => {
    if (!enabled || !pollMs) return;
    const timer = setInterval(() => {
      if (isPageVisible()) void run();
    }, pollMs);
    const onVisible = () => {
      if (isPageVisible()) void run();
    };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, pollMs, run]);

  return {
    data,
    error,
    loading: data === null && inFlight,
    refreshing: data !== null && inFlight,
    loadedAt,
    refetch: run,
  };
}
