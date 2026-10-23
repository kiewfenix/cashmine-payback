import { useMemo } from "react";

import { useToken } from "@/state/token";

import { createClaim, getActivity, getBalances, getClaim, getClaimOptions, type ActivityParams } from "./endpoints";
import type { CreateClaimBody } from "./types";

/** API calls bound to the current token. A 401 on any of them clears the token. */
export function useApi() {
  const { withAuth } = useToken();
  return useMemo(
    () => ({
      balances: (signal?: AbortSignal) => withAuth((token) => getBalances(token, signal)),
      activity: (params: ActivityParams, signal?: AbortSignal) => withAuth((token) => getActivity(token, params, signal)),
      claimOptions: (asset: string, signal?: AbortSignal) => withAuth((token) => getClaimOptions(token, asset, signal)),
      createClaim: (body: CreateClaimBody, idempotencyKey: string, signal?: AbortSignal) =>
        withAuth((token) => createClaim(token, body, idempotencyKey, signal)),
      claim: (id: string, signal?: AbortSignal) => withAuth((token) => getClaim(token, id, signal)),
    }),
    [withAuth],
  );
}

export type Api = ReturnType<typeof useApi>;
