import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import type { BalanceItem } from "@/api/types";
import { formatAmount, formatAmountUsd } from "@/lib/format";
import { isZero, toUnits } from "@/lib/money";
import { Button } from "@/ui/Button";
import { colors, spacing } from "@/ui/theme";

interface AssetCardProps {
  item: BalanceItem;
}

function hasAvailable(item: BalanceItem): boolean {
  try {
    return !isZero(toUnits(item.available, item.decimals));
  } catch {
    return false;
  }
}

export function AssetCard({ item }: AssetCardProps) {
  const router = useRouter();
  const claimable = hasAvailable(item);
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.asset}>{item.asset}</Text>
        <Text style={styles.usd}>{formatAmountUsd(item.available, item.decimals, item.usdPrice)}</Text>
      </View>
      <Text style={styles.available}>
        {formatAmount(item.available, item.decimals)} <Text style={styles.unit}>{item.asset}</Text>
      </Text>
      <Text style={styles.label}>Available to claim</Text>
      <View style={styles.rows}>
        <Row label="Pending" value={`${formatAmount(item.pending, item.decimals)} ${item.asset}`} />
        <Row label="Claiming" value={`${formatAmount(item.claiming, item.decimals)} ${item.asset}`} />
        <Row label="Price" value={`$${item.usdPrice}`} />
      </View>
      <Button
        title={claimable ? `Claim ${item.asset}` : "Nothing to claim"}
        onPress={() => router.push({ pathname: "/claim/[asset]", params: { asset: item.asset } })}
        disabled={!claimable}
      />
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  asset: { fontSize: 17, fontWeight: "700", color: colors.text },
  usd: { fontSize: 15, color: colors.muted },
  available: { fontSize: 24, fontWeight: "700", color: colors.text, marginTop: spacing.xs },
  unit: { fontSize: 15, fontWeight: "600", color: colors.muted },
  label: { fontSize: 13, color: colors.muted },
  rows: { marginTop: spacing.sm, marginBottom: spacing.sm, gap: spacing.xs },
  row: { flexDirection: "row", justifyContent: "space-between" },
  rowLabel: { fontSize: 14, color: colors.muted },
  rowValue: { fontSize: 14, color: colors.text, fontVariant: ["tabular-nums"] },
});
