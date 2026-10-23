import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View, type TextStyle } from "react-native";

import type { BalanceItem } from "@/api/types";
import { effectiveAvailableUnits, type ClaimAttempt } from "@/lib/claims";
import { formatAmount, formatAmountUsd, formatPrice, formatShortTime } from "@/lib/format";
import { formatUnits, isZero, toUnits } from "@/lib/money";
import { Button } from "@/ui/Button";
import { colors, spacing } from "@/ui/theme";

interface AssetCardProps {
  item: BalanceItem;
  asOf: string;
  /** Attempts for this asset only. */
  attempts: ClaimAttempt[];
}

function safeEffective(item: BalanceItem, asOf: string, attempts: ClaimAttempt[]): bigint | null {
  try {
    return effectiveAvailableUnits(item, asOf, attempts);
  } catch {
    return null;
  }
}

export function AssetCard({ item, asOf, attempts }: AssetCardProps) {
  const router = useRouter();
  const effective = safeEffective(item, asOf, attempts);
  const claimable = effective !== null && !isZero(effective);
  const reduced =
    effective !== null && formatUnits(effective, item.decimals) !== formatUnits(toUnits(item.available, item.decimals), item.decimals);

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
      {attempts.map((attempt) => (
        <AttemptLine key={attempt.key} attempt={attempt} asset={item.asset} onPress={attempt.claimId ? () => router.push({ pathname: "/claims/[id]", params: { id: attempt.claimId as string } }) : undefined} />
      ))}
      {reduced && effective !== null ? (
        <Text style={styles.claimable}>
          Claimable now: {formatUnits(effective, item.decimals, { maxFractionDigits: 8 })} {item.asset}
        </Text>
      ) : null}
      <View style={styles.rows}>
        <Row label="Pending" value={`${formatAmount(item.pending, item.decimals)} ${item.asset}`} />
        <Row label="Claiming" value={`${formatAmount(item.claiming, item.decimals)} ${item.asset}`} />
        <Row label="Price" value={formatPrice(item.usdPrice)} />
      </View>
      <Button
        title={claimable ? `Claim ${item.asset}` : "Nothing to claim"}
        onPress={() => router.push({ pathname: "/claim/[asset]", params: { asset: item.asset } })}
        disabled={!claimable}
      />
    </View>
  );
}

function attemptText(attempt: ClaimAttempt, asset: string): string {
  const amount = `${attempt.body.amount} ${asset}`;
  const time = formatShortTime(attempt.createdAt ?? attempt.startedAt);
  switch (attempt.status) {
    case "submitting":
    case "unknown":
      return `Claim ${amount} · not confirmed yet`;
    case "pending":
      return `Claim ${amount} pending · ${time}`;
    case "completed":
      return `Claim ${amount} completed · ${time}`;
    case "failed":
      return `Claim ${amount} failed: ${attempt.failureReason ?? "unknown reason"}`;
  }
}

function AttemptLine({ attempt, asset, onPress }: { attempt: ClaimAttempt; asset: string; onPress?: () => void }) {
  const tone: Record<ClaimAttempt["status"], TextStyle> = {
    submitting: styles.attemptUnknown,
    unknown: styles.attemptUnknown,
    pending: styles.attemptPending,
    completed: styles.attemptCompleted,
    failed: styles.attemptFailed,
  };
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? "link" : undefined}>
      <Text style={[styles.attempt, tone[attempt.status]]}>
        − {attemptText(attempt, asset)}
        {onPress ? " ›" : ""}
      </Text>
    </Pressable>
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
  attempt: { fontSize: 14, lineHeight: 20, fontWeight: "600" },
  attemptPending: { color: colors.accent },
  attemptUnknown: { color: colors.warning },
  attemptCompleted: { color: colors.success },
  attemptFailed: { color: colors.danger },
  claimable: { fontSize: 14, color: colors.text, fontWeight: "600" },
  rows: { marginTop: spacing.sm, marginBottom: spacing.sm, gap: spacing.xs },
  row: { flexDirection: "row", justifyContent: "space-between" },
  rowLabel: { fontSize: 14, color: colors.muted },
  rowValue: { fontSize: 14, color: colors.text, fontVariant: ["tabular-nums"] },
});
