import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import { isApiError } from "@/api/client";
import type { BalancesResponse, Claim, CreateClaimBody } from "@/api/types";
import { useApi } from "@/api/useApi";
import { applyClaim, pruneAttempts, type ClaimAttempt } from "@/lib/claims";
import { useToken } from "@/state/token";

const STORAGE_PREFIX = "cashmine.claims.";
const RATE_LIMIT_RETRIES = 2;
const UNKNOWN_AUTO_RETRY_MS = 2_000;

function storageKey(token: string): string {
  // Attempts are keyed by a hash of the token so the token itself is never written next to them.
  let hash = 5381;
  for (let i = 0; i < token.length; i += 1) hash = ((hash * 33) ^ token.charCodeAt(i)) >>> 0;
  return `${STORAGE_PREFIX}${hash.toString(16)}`;
}

function readAttempts(token: string | null): ClaimAttempt[] {
  if (token === null) return [];
  try {
    if (typeof window === "undefined" || !window.localStorage) return [];
    const raw = window.localStorage.getItem(storageKey(token));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    // A request that was in flight when the page closed has an unknown outcome.
    return (parsed as ClaimAttempt[]).map((a) => (a.status === "submitting" ? { ...a, status: "unknown" } : a));
  } catch {
    return [];
  }
}

function writeAttempts(token: string | null, attempts: ClaimAttempt[]): void {
  if (token === null) return;
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(storageKey(token), JSON.stringify(attempts));
  } catch {
    // Storage unavailable: attempts live in memory for this visit only.
  }
}

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === "x" ? r : (r % 4) + 8).toString(16);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type SubmitOutcome =
  | { kind: "created"; claim: Claim; replayed: boolean }
  | { kind: "rejected"; error: unknown }
  | { kind: "unknown"; error: unknown };

interface ClaimsContextValue {
  attempts: ClaimAttempt[];
  /** Mints the Idempotency-Key and stores the attempt before anything is sent. */
  startAttempt: (body: CreateClaimBody, decimals: number) => ClaimAttempt;
  /** Sends (or resends) the attempt with its own key. Safe to call again after an unknown outcome. */
  submitAttempt: (attempt: ClaimAttempt, options?: { autoRetry?: boolean }) => Promise<SubmitOutcome>;
  /** Updates the matching attempt from a claim the server returned. */
  recordClaim: (claim: Claim) => void;
  /** Drops attempts a new balances snapshot has made redundant. */
  reconcile: (snapshot: BalancesResponse) => void;
  /** Re-reads pending claims from the server. */
  refreshPending: () => Promise<void>;
}

const ClaimsContext = createContext<ClaimsContextValue | null>(null);

export function ClaimsProvider({ children }: PropsWithChildren) {
  const { token } = useToken();
  const api = useApi();
  const [attempts, setAttempts] = useState<ClaimAttempt[]>(() => readAttempts(token));
  const [loadedFor, setLoadedFor] = useState(token);
  if (loadedFor !== token) {
    // Token changed: switch to that token's attempts (adjusting state during render, per React docs).
    setLoadedFor(token);
    setAttempts(readAttempts(token));
  }

  const attemptsRef = useRef(attempts);
  useEffect(() => {
    attemptsRef.current = attempts;
    writeAttempts(token, attempts);
  }, [attempts, token]);

  const patch = useCallback((key: string, changes: Partial<ClaimAttempt>) => {
    const now = new Date().toISOString();
    setAttempts((prev) => prev.map((a) => (a.key === key ? { ...a, ...changes, updatedAt: now } : a)));
  }, []);

  const remove = useCallback((key: string) => {
    setAttempts((prev) => prev.filter((a) => a.key !== key));
  }, []);

  const startAttempt = useCallback((body: CreateClaimBody, decimals: number): ClaimAttempt => {
    const now = new Date().toISOString();
    const attempt: ClaimAttempt = {
      key: newIdempotencyKey(),
      body,
      decimals,
      status: "submitting",
      startedAt: now,
      updatedAt: now,
    };
    setAttempts((prev) => [...prev, attempt]);
    return attempt;
  }, []);

  const submitAttempt = useCallback(
    async (attempt: ClaimAttempt, options: { autoRetry?: boolean } = {}): Promise<SubmitOutcome> => {
      patch(attempt.key, { status: "submitting" });
      let rateLimited = 0;
      for (;;) {
        try {
          const { claim, replayed } = await api.createClaim(attempt.body, attempt.key);
          setAttempts((prev) =>
            prev.map((a) => (a.key === attempt.key ? applyClaim(a, claim, new Date().toISOString()) : a)),
          );
          return { kind: "created", claim, replayed };
        } catch (error) {
          if (isApiError(error)) {
            if (error.status === 429 && rateLimited < RATE_LIMIT_RETRIES) {
              rateLimited += 1;
              await sleep(error.retryAfterMs ?? 1_000);
              continue; // same key, same body
            }
            if (error.status < 500) {
              // The server answered and did not create a claim: 400, 401, 404, 409 or a persistent 429.
              remove(attempt.key);
              return { kind: "rejected", error };
            }
          }
          // 5xx, 504, network failure or our own timeout: the claim may or may not exist.
          patch(attempt.key, { status: "unknown" });
          if (options.autoRetry) {
            await sleep(UNKNOWN_AUTO_RETRY_MS);
            return submitAttempt(attempt, { autoRetry: false });
          }
          return { kind: "unknown", error };
        }
      }
    },
    [api, patch, remove],
  );

  const recordClaim = useCallback((claim: Claim) => {
    const now = new Date().toISOString();
    setAttempts((prev) => prev.map((a) => (a.claimId === claim.id ? applyClaim(a, claim, now) : a)));
  }, []);

  const reconcile = useCallback((snapshot: BalancesResponse) => {
    setAttempts((prev) => {
      const next = pruneAttempts(prev, snapshot.asOf, Date.now());
      return next.length === prev.length ? prev : next;
    });
  }, []);

  const refreshPending = useCallback(async () => {
    const pending = attemptsRef.current.filter((a) => a.status === "pending" && a.claimId);
    await Promise.all(
      pending.map(async (a) => {
        try {
          recordClaim(await api.claim(a.claimId as string));
        } catch {
          // Leave the attempt as it is; the next refresh will try again.
        }
      }),
    );
  }, [api, recordClaim]);

  // On load, resolve attempts whose outcome is unknown by resending them with their own key.
  useEffect(() => {
    if (token === null) return;
    const timer = setTimeout(() => {
      for (const attempt of attemptsRef.current.filter((a) => a.status === "unknown")) {
        void submitAttempt(attempt);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [token, submitAttempt]);

  const value = useMemo<ClaimsContextValue>(
    () => ({ attempts, startAttempt, submitAttempt, recordClaim, reconcile, refreshPending }),
    [attempts, startAttempt, submitAttempt, recordClaim, reconcile, refreshPending],
  );

  return <ClaimsContext.Provider value={value}>{children}</ClaimsContext.Provider>;
}

export function useClaims(): ClaimsContextValue {
  const context = useContext(ClaimsContext);
  if (!context) throw new Error("useClaims must be used inside ClaimsProvider");
  return context;
}
