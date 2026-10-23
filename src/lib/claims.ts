import type { BalanceItem, Claim, ClaimStatus, CreateClaimBody } from "@/api/types";

import { toUnits } from "./money";

export type AttemptStatus = "submitting" | "unknown" | ClaimStatus;

/** One confirmed claim attempt. The Idempotency-Key is minted once and reused for every resend. */
export interface ClaimAttempt {
  key: string;
  body: CreateClaimBody;
  decimals: number;
  status: AttemptStatus;
  /** Client time when the user confirmed. */
  startedAt: string;
  updatedAt: string;
  claimId?: string;
  /** Server time the claim was created. A snapshot taken at or after it already excludes the amount. */
  createdAt?: string;
  fee?: string;
  receiveAmount?: string;
  failureReason?: string | null;
}

export const FAILED_VISIBLE_MS = 2 * 60_000;

export function isInFlight(attempt: ClaimAttempt): boolean {
  return attempt.status === "submitting" || attempt.status === "unknown" || attempt.status === "pending";
}

/** True once a balances snapshot already accounts for this claim. Unconfirmed attempts never are. */
export function isReflected(attempt: ClaimAttempt, asOf: string): boolean {
  return attempt.createdAt !== undefined && Date.parse(asOf) >= Date.parse(attempt.createdAt);
}

/** Attempts that still reduce what can be claimed from this snapshot of `asset`. */
export function unreflectedAttempts(attempts: ClaimAttempt[], asset: string, asOf: string): ClaimAttempt[] {
  return attempts.filter((a) => a.body.asset === asset && a.status !== "failed" && !isReflected(a, asOf));
}

/** Snapshot `available` minus claims the snapshot does not include yet. Never negative. */
export function effectiveAvailableUnits(item: BalanceItem, asOf: string, attempts: ClaimAttempt[]): bigint {
  let units = toUnits(item.available, item.decimals);
  for (const attempt of unreflectedAttempts(attempts, item.asset, asOf)) {
    units -= toUnits(attempt.body.amount, item.decimals);
  }
  return units < 0n ? 0n : units;
}

export function applyClaim(attempt: ClaimAttempt, claim: Claim, now: string): ClaimAttempt {
  return {
    ...attempt,
    status: claim.status,
    claimId: claim.id,
    createdAt: claim.createdAt,
    fee: claim.fee,
    receiveAmount: claim.receiveAmount,
    failureReason: claim.failureReason,
    updatedAt: now,
  };
}

/** Drops completed attempts once a snapshot reflects them, and failed ones after a while. */
export function pruneAttempts(attempts: ClaimAttempt[], asOf: string, now: number): ClaimAttempt[] {
  return attempts.filter((a) => {
    if (a.status === "completed") return !isReflected(a, asOf);
    if (a.status === "failed") return now - Date.parse(a.updatedAt) < FAILED_VISIBLE_MS;
    return true;
  });
}
