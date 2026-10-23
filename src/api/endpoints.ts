import { apiFetch } from "./client";
import type {
  ActivityResponse,
  BalancesResponse,
  Claim,
  ClaimOptions,
  CreateClaimBody,
} from "./types";

export function getBalances(token: string, signal?: AbortSignal): Promise<BalancesResponse> {
  return apiFetch<BalancesResponse>("/v1/balances", { token, signal }).then((r) => r.data);
}

export interface ActivityParams {
  cursor?: string | null;
  /** 1 to 20, default 20. */
  limit?: number;
}

export function getActivity(token: string, params: ActivityParams = {}, signal?: AbortSignal): Promise<ActivityResponse> {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.cursor) query.set("cursor", params.cursor);
  const qs = query.toString();
  return apiFetch<ActivityResponse>(`/v1/activity${qs ? `?${qs}` : ""}`, { token, signal }).then((r) => r.data);
}

export function getClaimOptions(token: string, asset: string, signal?: AbortSignal): Promise<ClaimOptions> {
  return apiFetch<ClaimOptions>(`/v1/claim-options?asset=${encodeURIComponent(asset)}`, { token, signal }).then(
    (r) => r.data,
  );
}

export interface CreateClaimResult {
  claim: Claim;
  /** True when the server returned an earlier claim for the same Idempotency-Key. */
  replayed: boolean;
}

export async function createClaim(
  token: string,
  body: CreateClaimBody,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<CreateClaimResult> {
  const response = await apiFetch<Claim>("/v1/claims", {
    method: "POST",
    body,
    token,
    idempotencyKey,
    timeoutMs: 20_000,
    signal,
  });
  return { claim: response.data, replayed: response.headers.get("Idempotent-Replayed") === "true" };
}

export function getClaim(token: string, id: string, signal?: AbortSignal): Promise<Claim> {
  return apiFetch<Claim>(`/v1/claims/${encodeURIComponent(id)}`, { token, signal }).then((r) => r.data);
}
