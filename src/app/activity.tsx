import { Stack } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { errorMessage } from "@/api/client";
import type { ActivityItem, ActivityType } from "@/api/types";
import { useApi } from "@/api/useApi";
import { useResource } from "@/hooks/useResource";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/ui/Button";
import { ErrorBanner } from "@/ui/ErrorBanner";
import { colors, spacing } from "@/ui/theme";

const PAGE_SIZE = 20;

const TYPE_LABEL: Record<ActivityType, string> = {
  accrual: "Accrual",
  reversal: "Reversal",
  claim: "Claim",
};

interface ExtraPages {
  items: ActivityItem[];
  nextCursor: string | null;
}

export default function ActivityScreen() {
  const api = useApi();
  const load = useCallback((signal: AbortSignal) => api.activity({ limit: PAGE_SIZE }, signal), [api]);
  const { data, error, loading, refetch } = useResource(load);
  const [extra, setExtra] = useState<ExtraPages | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  const items = [...(data?.items ?? []), ...(extra?.items ?? [])];
  const nextCursor = extra ? extra.nextCursor : (data?.nextCursor ?? null);

  const reload = () => {
    setExtra(null);
    setMoreError(null);
    void refetch();
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await api.activity({ limit: PAGE_SIZE, cursor: nextCursor });
      setExtra((prev) => ({ items: [...(prev?.items ?? []), ...page.items], nextCursor: page.nextCursor }));
    } catch (caught) {
      setMoreError(errorMessage(caught));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: "Activity" }} />
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? <Text style={styles.muted}>Loading history…</Text> : null}
        {error !== null && data === null ? <ErrorBanner message={errorMessage(error)} onRetry={reload} /> : null}
        {data !== null ? (
          <View style={styles.list}>
            {items.length === 0 ? <Text style={styles.muted}>No activity yet.</Text> : null}
            {items.map((item) => (
              <ActivityRow key={item.id} item={item} />
            ))}
            {moreError ? <ErrorBanner message={moreError} onRetry={() => void loadMore()} retrying={loadingMore} /> : null}
            {nextCursor ? (
              <Button title="Load more" variant="secondary" onPress={() => void loadMore()} loading={loadingMore} />
            ) : items.length > 0 ? (
              <Text style={styles.end}>End of history.</Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const negative = item.amount.startsWith("-");
  const detail = [TYPE_LABEL[item.type], item.exchange].filter(Boolean).join(" · ");
  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={styles.type}>{detail}</Text>
        <Text style={[styles.meta, item.status === "failed" && styles.failed]}>
          {formatDateTime(item.createdAt)} · {item.status}
        </Text>
      </View>
      <Text style={[styles.amount, negative && styles.negative]} selectable>
        {negative ? "" : "+"}
        {item.amount} {item.asset}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, paddingBottom: spacing.lg },
  list: { gap: spacing.sm },
  muted: { fontSize: 15, color: colors.muted },
  end: { fontSize: 14, color: colors.muted, textAlign: "center", paddingVertical: spacing.sm },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  rowMain: { flexShrink: 1, gap: 2 },
  type: { fontSize: 15, fontWeight: "600", color: colors.text },
  meta: { fontSize: 13, color: colors.muted },
  failed: { color: colors.danger },
  amount: { fontSize: 15, fontWeight: "700", color: colors.success, fontVariant: ["tabular-nums"], textAlign: "right" },
  negative: { color: colors.danger },
});
