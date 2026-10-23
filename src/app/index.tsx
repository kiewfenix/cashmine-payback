import { Stack } from "expo-router";
import { useCallback, useEffect } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { errorMessage } from "@/api/client";
import type { BalancesResponse } from "@/api/types";
import { useApi } from "@/api/useApi";
import { AssetCard } from "@/components/AssetCard";
import { useNow } from "@/hooks/useNow";
import { useResource } from "@/hooks/useResource";
import { formatClock, secondsSince } from "@/lib/format";
import { formatUsd, sumUsdCents } from "@/lib/money";
import { useClaims } from "@/state/claims";
import { ErrorBanner } from "@/ui/ErrorBanner";
import { HeaderButton } from "@/ui/HeaderButton";
import { colors, spacing } from "@/ui/theme";

const POLL_MS = 15_000;
const STALE_AFTER_S = 60;

export default function BalancesScreen() {
  const api = useApi();
  const load = useCallback((signal: AbortSignal) => api.balances(signal), [api]);
  const { data, error, loading, refreshing, refetch } = useResource(load, { pollMs: POLL_MS });
  const { reconcile, refreshPending } = useClaims();

  // Each snapshot can retire reflected claims; pending ones are re-read so their lines stay current.
  useEffect(() => {
    if (data === null) return;
    reconcile(data);
    void refreshPending();
  }, [data, reconcile, refreshPending]);

  return (
    <>
      <Stack.Screen
        options={{ headerLeft: () => <HeaderButton title="Refresh" onPress={() => void refetch()} busy={refreshing} /> }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {data === null && loading ? <Skeleton /> : null}
        {data === null && !loading && error !== null ? (
          <ErrorBanner message={errorMessage(error)} onRetry={() => void refetch()} />
        ) : null}
        {data !== null ? (
          <Balances data={data} error={error} refreshing={refreshing} onRetry={() => void refetch()} />
        ) : null}
      </ScrollView>
    </>
  );
}

interface BalancesProps {
  data: BalancesResponse;
  error: unknown;
  refreshing: boolean;
  onRetry: () => void;
}

function Balances({ data, error, refreshing, onRetry }: BalancesProps) {
  const now = useNow();
  const age = secondsSince(data.asOf, now);
  const stale = age > STALE_AFTER_S || error !== null;
  const totals = safeTotals(data);
  const { attempts, submitAttempt } = useClaims();
  const unknown = attempts.filter((a) => a.status === "unknown");
  const resolving = attempts.some((a) => a.status === "submitting");

  return (
    <View style={styles.list}>
      {unknown.map((attempt) => (
        <ErrorBanner
          key={attempt.key}
          tone="warning"
          message={`A claim of ${attempt.body.amount} ${attempt.body.asset} could not be confirmed. Nothing will be claimed twice: resolving resends the same request with the same key.`}
          onRetry={() => void submitAttempt(attempt)}
          retryLabel="Resolve"
          retrying={resolving}
        />
      ))}
      {error !== null ? (
        <ErrorBanner
          tone="warning"
          message={`Couldn't refresh: ${errorMessage(error)} Showing the last data we have.`}
          onRetry={onRetry}
          retrying={refreshing}
        />
      ) : null}
      <View style={styles.summary}>
        <Text style={styles.summaryLabel}>Available to claim</Text>
        <Text style={styles.summaryValue}>{totals.available}</Text>
        <Text style={styles.summaryPending}>Pending {totals.pending}</Text>
        <Text style={[styles.freshness, stale && styles.freshnessStale]}>
          {stale ? "Stale · " : ""}Updated {formatClock(data.asOf)} · {age} s ago
        </Text>
      </View>
      {data.items.length === 0 ? <Text style={styles.empty}>No payback balances yet.</Text> : null}
      {data.items.map((item) => (
        <AssetCard
          key={item.asset}
          item={item}
          asOf={data.asOf}
          attempts={attempts.filter((a) => a.body.asset === item.asset)}
        />
      ))}
    </View>
  );
}

function safeTotals(data: BalancesResponse): { available: string; pending: string } {
  try {
    const items = data.items.map((i) => ({ decimals: i.decimals, usdPrice: i.usdPrice }));
    return {
      available: formatUsd(sumUsdCents(data.items.map((i, n) => ({ ...items[n], amount: i.available })))),
      pending: formatUsd(sumUsdCents(data.items.map((i, n) => ({ ...items[n], amount: i.pending })))),
    };
  } catch {
    return { available: "—", pending: "—" };
  }
}

function Skeleton() {
  return (
    <View style={styles.list} accessibilityLabel="Loading balances">
      <View style={[styles.skeleton, styles.skeletonSummary]} />
      <View style={[styles.skeleton, styles.skeletonCard]} />
      <View style={[styles.skeleton, styles.skeletonCard]} />
      <View style={[styles.skeleton, styles.skeletonCard]} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, paddingBottom: spacing.lg },
  list: { gap: spacing.md },
  summary: { gap: spacing.xs },
  summaryLabel: { fontSize: 14, color: colors.muted },
  summaryValue: { fontSize: 36, fontWeight: "800", color: colors.text, fontVariant: ["tabular-nums"] },
  summaryPending: { fontSize: 15, color: colors.muted },
  freshness: { fontSize: 13, color: colors.muted, marginTop: spacing.xs },
  freshnessStale: { color: colors.warning, fontWeight: "600" },
  empty: { fontSize: 15, color: colors.muted },
  skeleton: { backgroundColor: colors.border, borderRadius: 16 },
  skeletonSummary: { height: 96 },
  skeletonCard: { height: 180 },
});
