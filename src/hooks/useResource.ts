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

export interface ResourceOptions<T> {
  /** Re-load every N ms while the page is visible. */
  pollMs?: number;
  /** Polling continues only while this returns true for the current data (default: always). */
  pollWhile?: (data: T | null) => boolean;
  enabled?: boolean;
}

function isPageVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

/**
 * Loads something cancellable, keeps the last good value, optionally polls while the page is visible.
 * `load` must be stable (useCallback): a new `load` restarts the request.
 */
export function useResource<T>(load: (signal: AbortSignal) => Promise<T>, options: ResourceOptions<T> = {}): Resource<T> {
  const { pollMs, pollWhile, enabled = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [inFlight, setInFlight] = useState(false);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const dataRef = useRef<T | null>(null);
  const pollWhileRef = useRef(pollWhile);
  useEffect(() => {
    dataRef.current = data;
    pollWhileRef.current = pollWhile;
  }, [data, pollWhile]);

  const run = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setInFlight(true);
    try {
      const next = await load(controller.signal);
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
  }, [load]);

  useEffect(() => {
    if (!enabled) return;
    // Kicking off the fetch is this effect's purpose; the state it sets is the request status.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void run();
    return () => controllerRef.current?.abort();
  }, [enabled, run]);

  useEffect(() => {
    if (!enabled || !pollMs) return;
    const timer = setInterval(() => {
      // A poll tick never cancels a request that is still running; it just waits for the next tick.
      if (controllerRef.current !== null) return;
      if (isPageVisible() && (pollWhileRef.current?.(dataRef.current) ?? true)) void run();
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
