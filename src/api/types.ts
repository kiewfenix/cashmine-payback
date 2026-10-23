// Types mirror https://task-api.cashmine.io/docs. Every amount is a decimal string, never a number.

export interface BalanceItem {
  asset: string;
  /** Maximum number of decimal places this asset allows. */
  decimals: number;
  /** Can be claimed now. */
  available: string;
  /** Accrued but not yet confirmed. */
  pending: string;
  /** In claims that have not completed yet. */
  claiming: string;
  /** Price of one unit in USD. */
  usdPrice: string;
}

export interface BalancesResponse {
  /** Time of the snapshot; recomputed every 15 seconds. */
  asOf: string;
  items: BalanceItem[];
}

export type ActivityType = "accrual" | "reversal" | "claim";
export type ActivityStatus = "pending" | "confirmed" | "completed" | "failed";

export interface ActivityItem {
  id: string;
  type: ActivityType;
  asset: string;
  /** Signed: negative for reversals and claims. */
  amount: string;
  status: ActivityStatus;
  /** Where the payback came from; null for claims. */
  exchange: string | null;
  createdAt: string;
  relatedId: string | null;
}

export interface ActivityResponse {
  items: ActivityItem[];
  /** Null on the last page. */
  nextCursor: string | null;
}

export interface ClaimDestination {
  id: string;
  label: string;
}

export interface ClaimOptions {
  asset: string;
  minAmount: string;
  /** Taken from the claimed amount: the user receives amount minus fee. */
  fee: string;
  destinations: ClaimDestination[];
}

export interface CreateClaimBody {
  asset: string;
  amount: string;
  destinationId: string;
}

export type ClaimStatus = "pending" | "completed" | "failed";

export interface Claim {
  id: string;
  asset: string;
  amount: string;
  fee: string;
  receiveAmount: string;
  destinationId: string;
  status: ClaimStatus;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    field?: string;
    retryAfterMs?: number;
  };
}
