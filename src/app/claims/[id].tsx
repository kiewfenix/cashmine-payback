import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

import { errorMessage } from "@/api/client";
import type { Claim } from "@/api/types";
import { useApi } from "@/api/useApi";
import { useResource } from "@/hooks/useResource";
import { formatDateTime } from "@/lib/format";
import { useClaims } from "@/state/claims";
import { Button } from "@/ui/Button";
import { ErrorBanner } from "@/ui/ErrorBanner";
import { colors, spacing } from "@/ui/theme";

const POLL_MS = 2_000;

/** Keep polling until the claim settles. */
function isPending(claim: Claim | null): boolean {
  return claim === null || claim.status === "pending";
}

export default function ClaimStatusScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const claimId = id ?? "";
  const api = useApi();
  const router = useRouter();
  const { recordClaim } = useClaims();
  const load = useCallback((signal: AbortSignal) => api.claim(claimId, signal), [api, claimId]);
  const { data, error, loading, refreshing, refetch } = useResource(load, { pollMs: POLL_MS, pollWhile: isPending });

  useEffect(() => {
    if (data) recordClaim(data);
  }, [data, recordClaim]);

  return (
    <>
      <Stack.Screen options={{ title: "Claim status", headerBackVisible: false }} />
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? <Text style={styles.muted}>Loading claim…</Text> : null}
        {error !== null && data === null ? <ErrorBanner message={errorMessage(error)} onRetry={() => void refetch()} /> : null}
        {data !== null ? (
          <>
            {error !== null ? (
              <ErrorBanner tone="warning" message={`Couldn't refresh the status: ${errorMessage(error)}`} onRetry={() => void refetch()} retrying={refreshing} />
            ) : null}
            <StatusCard claim={data} />
          </>
        ) : null}
        <Button title="Back to balances" variant="secondary" onPress={() => router.replace("/")} />
      </ScrollView>
    </>
  );
}

function StatusCard({ claim }: { claim: Claim }) {
  const pending = claim.status === "pending";
  return (
    <View style={styles.card}>
      <View style={styles.statusRow}>
        {pending ? <ActivityIndicator color={colors.accent} /> : null}
        <Text style={[styles.status, claim.status === "completed" && styles.completed, claim.status === "failed" && styles.failed]}>
          {pending ? "Pending" : claim.status === "completed" ? "Completed" : "Failed"}
        </Text>
      </View>
      <Text style={styles.hint}>
        {pending
          ? "Usually settles within about 20 seconds. You can leave this screen; the claim keeps going."
          : claim.status === "completed"
            ? `${claim.receiveAmount} ${claim.asset} sent to your destination. Balances update within about 15 seconds.`
            : `${claim.failureReason ?? "The claim failed."} The amount returns to your available balance.`}
      </Text>
      <View style={styles.rows}>
        <Row label="Amount" value={`${claim.amount} ${claim.asset}`} />
        <Row label="Fee" value={`${claim.fee} ${claim.asset}`} />
        <Row label="You receive" value={`${claim.receiveAmount} ${claim.asset}`} strong />
        <Row label="Destination" value={claim.destinationId} />
        <Row label="Created" value={formatDateTime(claim.createdAt)} />
        <Row label="Updated" value={formatDateTime(claim.updatedAt)} />
        <Row label="Claim id" value={claim.id} />
      </View>
    </View>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.rowStrong]} selectable>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, paddingBottom: spacing.lg, gap: spacing.md },
  muted: { fontSize: 15, color: colors.muted },
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  status: { fontSize: 22, fontWeight: "700", color: colors.text },
  completed: { color: colors.success },
  failed: { color: colors.danger },
  hint: { fontSize: 14, lineHeight: 20, color: colors.muted },
  rows: { gap: spacing.xs, marginTop: spacing.xs },
  row: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  rowLabel: { fontSize: 14, color: colors.muted },
  rowValue: { fontSize: 14, color: colors.text, flexShrink: 1, textAlign: "right", fontVariant: ["tabular-nums"] },
  rowStrong: { fontSize: 16, fontWeight: "700" },
});
