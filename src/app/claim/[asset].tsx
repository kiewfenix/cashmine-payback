import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { errorMessage, isApiError } from "@/api/client";
import type { BalanceItem, ClaimOptions } from "@/api/types";
import { useApi } from "@/api/useApi";
import { useResource } from "@/hooks/useResource";
import { effectiveAvailableUnits, type ClaimAttempt } from "@/lib/claims";
import { formatAmount } from "@/lib/format";
import { computeReceive, formatUnits, toUnits, validateClaimAmount, type ClaimAmountError } from "@/lib/money";
import { useClaims, type SubmitOutcome } from "@/state/claims";
import { Button } from "@/ui/Button";
import { ErrorBanner } from "@/ui/ErrorBanner";
import { colors, spacing } from "@/ui/theme";

type Step = "form" | "confirm" | "submitting" | "unknown";

export default function ClaimScreen() {
  const { asset } = useLocalSearchParams<{ asset: string }>();
  const assetCode = asset ?? "";
  const api = useApi();
  const load = useCallback(
    (signal: AbortSignal) => Promise.all([api.balances(signal), api.claimOptions(assetCode, signal)]),
    [api, assetCode],
  );
  const { data, error, loading, refetch } = useResource(load);

  return (
    <>
      <Stack.Screen options={{ title: `Claim ${assetCode}` }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {loading ? <Text style={styles.muted}>Loading claim options…</Text> : null}
        {!loading && error !== null && data === null ? (
          <ErrorBanner message={errorMessage(error)} onRetry={() => void refetch()} />
        ) : null}
        {data !== null ? (
          <ClaimForm
            item={data[0].items.find((i) => i.asset === assetCode)}
            asOf={data[0].asOf}
            options={data[1]}
            onRefresh={() => void refetch()}
          />
        ) : null}
      </ScrollView>
    </>
  );
}

interface ClaimFormProps {
  item: BalanceItem | undefined;
  asOf: string;
  options: ClaimOptions;
  onRefresh: () => void;
}

function ClaimForm({ item, asOf, options, onRefresh }: ClaimFormProps) {
  const router = useRouter();
  const { attempts, startAttempt, submitAttempt } = useClaims();
  const [input, setInput] = useState("");
  const [destinationId, setDestinationId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("form");
  const [banner, setBanner] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<ClaimAttempt | null>(null);
  const [retrying, setRetrying] = useState(false);

  if (!item) return <Text style={styles.muted}>Unknown asset.</Text>;

  const { decimals } = item;
  const effectiveUnits = effectiveAvailableUnits(item, asOf, attempts);
  const effective = formatUnits(effectiveUnits, decimals);
  const reduced = effective !== formatUnits(toUnits(item.available, decimals), decimals);
  const selectedDestination =
    destinationId ?? (options.destinations.length === 1 ? options.destinations[0].id : null);
  const destinationLabel = options.destinations.find((d) => d.id === selectedDestination)?.label ?? "";
  const validation = validateClaimAmount({ input, decimals, minAmount: options.minAmount, available: effective, fee: options.fee });
  const feeUnits = toUnits(options.fee, decimals);
  const amountText = validation.ok ? formatUnits(validation.units, decimals) : "";
  const receiveText = validation.ok ? formatUnits(computeReceive(validation.units, feeUnits), decimals) : "";
  const validationMessage = validation.ok ? null : messageFor(validation.code, { asset: item.asset, decimals, min: options.minAmount, effective, fee: options.fee });

  const handleOutcome = (outcome: SubmitOutcome) => {
    if (outcome.kind === "created") {
      router.replace({ pathname: "/claims/[id]", params: { id: outcome.claim.id } });
      return;
    }
    if (outcome.kind === "rejected") {
      const field = isApiError(outcome.error) && outcome.error.field ? ` (${outcome.error.field})` : "";
      setBanner(`${errorMessage(outcome.error)}${field}`);
      setStep("form");
      onRefresh(); // `available` is checked live by the server; show the current numbers
      return;
    }
    setStep("unknown");
  };

  const confirm = async () => {
    if (!validation.ok || !selectedDestination) return;
    const started = startAttempt({ asset: item.asset, amount: amountText, destinationId: selectedDestination }, decimals);
    setAttempt(started);
    setBanner(null);
    setStep("submitting");
    handleOutcome(await submitAttempt(started, { autoRetry: true }));
  };

  const retryUnknown = async () => {
    if (!attempt) return;
    setRetrying(true);
    try {
      handleOutcome(await submitAttempt(attempt));
    } finally {
      setRetrying(false);
    }
  };

  if (step === "unknown") {
    return (
      <View style={styles.stack}>
        <ErrorBanner
          tone="warning"
          message="We couldn't confirm your claim. Nothing will be claimed twice: checking again sends the same request with the same idempotency key."
        />
        <Summary asset={item.asset} amount={attempt?.body.amount ?? amountText} fee={options.fee} receive={receiveText} destination={destinationLabel} />
        <Button title="Check / retry" onPress={() => void retryUnknown()} loading={retrying} />
        <Button title="Back to balances" variant="secondary" onPress={() => router.replace("/")} disabled={retrying} />
      </View>
    );
  }

  if (step === "confirm" || step === "submitting") {
    return (
      <View style={styles.stack}>
        <Text style={styles.title}>Confirm your claim</Text>
        <Summary asset={item.asset} amount={amountText} fee={options.fee} receive={receiveText} destination={destinationLabel} />
        <Button title="Confirm claim" onPress={() => void confirm()} loading={step === "submitting"} />
        <Button title="Back" variant="secondary" onPress={() => setStep("form")} disabled={step === "submitting"} />
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      {banner ? <ErrorBanner message={banner} /> : null}
      <View style={styles.card}>
        <Text style={styles.label}>Available to claim</Text>
        <Text style={styles.available}>
          {effective} <Text style={styles.unit}>{item.asset}</Text>
        </Text>
        {reduced ? (
          <Text style={styles.hint}>
            Snapshot shows {formatAmount(item.available, decimals, decimals)} {item.asset}; a claim you already made is not in it yet.
          </Text>
        ) : null}
        <Text style={styles.hint}>
          Minimum {options.minAmount} {item.asset} · fee {options.fee} {item.asset} taken from the amount
        </Text>
      </View>

      <Text style={styles.label}>Amount</Text>
      <View style={styles.inputRow}>
        <TextInput
          value={input}
          onChangeText={setInput}
          inputMode="decimal"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="0.00"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Amount"
          style={[styles.input, validationMessage && input.trim() !== "" ? styles.inputInvalid : null]}
        />
        <Pressable accessibilityRole="button" onPress={() => setInput(effective)} style={styles.max}>
          <Text style={styles.maxText}>Max</Text>
        </Pressable>
      </View>
      {validationMessage && input.trim() !== "" ? <Text style={styles.error}>{validationMessage}</Text> : null}

      {options.destinations.length > 1 ? (
        <>
          <Text style={styles.label}>Destination</Text>
          {options.destinations.map((d) => (
            <Pressable
              key={d.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: d.id === selectedDestination }}
              onPress={() => setDestinationId(d.id)}
              style={[styles.destination, d.id === selectedDestination && styles.destinationSelected]}
            >
              <Text style={styles.destinationText}>{d.label}</Text>
            </Pressable>
          ))}
        </>
      ) : (
        <Text style={styles.hint}>Destination: {destinationLabel}</Text>
      )}

      <View style={styles.card}>
        <Row label="Fee" value={`${options.fee} ${item.asset}`} />
        <Row label="You receive" value={validation.ok ? `${receiveText} ${item.asset}` : "—"} strong />
      </View>

      <Button title="Continue" onPress={() => setStep("confirm")} disabled={!validation.ok || !selectedDestination} />
    </View>
  );
}

function messageFor(
  code: ClaimAmountError,
  ctx: { asset: string; decimals: number; min: string; effective: string; fee: string },
): string {
  switch (code) {
    case "empty":
      return "Enter an amount.";
    case "format":
      return "Use digits with an optional decimal point, like 0.5.";
    case "too_many_decimals":
      return `${ctx.asset} allows at most ${ctx.decimals} decimal places.`;
    case "below_min":
      return `Minimum is ${ctx.min} ${ctx.asset}.`;
    case "above_available":
      return `You can claim up to ${ctx.effective} ${ctx.asset}.`;
    case "not_positive_after_fee":
      return `The amount must be more than the ${ctx.fee} ${ctx.asset} fee.`;
  }
}

function Summary({ asset, amount, fee, receive, destination }: { asset: string; amount: string; fee: string; receive: string; destination: string }) {
  return (
    <View style={styles.card}>
      <Row label="Asset" value={asset} />
      <Row label="Amount" value={`${amount} ${asset}`} />
      <Row label="Fee" value={`${fee} ${asset}`} />
      <Row label="You receive" value={`${receive} ${asset}`} strong />
      <Row label="Destination" value={destination} />
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
  content: { padding: spacing.md, paddingBottom: spacing.lg },
  stack: { gap: spacing.md },
  title: { fontSize: 20, fontWeight: "700", color: colors.text },
  muted: { fontSize: 15, color: colors.muted },
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.xs },
  label: { fontSize: 14, color: colors.muted },
  available: { fontSize: 24, fontWeight: "700", color: colors.text },
  unit: { fontSize: 15, fontWeight: "600", color: colors.muted },
  hint: { fontSize: 13, lineHeight: 18, color: colors.muted },
  inputRow: { flexDirection: "row", gap: spacing.sm },
  input: { flex: 1, minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.card, paddingHorizontal: spacing.md, fontSize: 18, color: colors.text },
  inputInvalid: { borderColor: colors.danger },
  max: { minHeight: 48, paddingHorizontal: spacing.md, borderRadius: 12, borderWidth: 1, borderColor: colors.accent, alignItems: "center", justifyContent: "center" },
  maxText: { color: colors.accent, fontSize: 16, fontWeight: "600" },
  error: { fontSize: 14, color: colors.danger },
  destination: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.card, paddingHorizontal: spacing.md, justifyContent: "center" },
  destinationSelected: { borderColor: colors.accent, borderWidth: 2 },
  destinationText: { fontSize: 15, color: colors.text },
  row: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  rowLabel: { fontSize: 14, color: colors.muted },
  rowValue: { fontSize: 14, color: colors.text, flexShrink: 1, textAlign: "right", fontVariant: ["tabular-nums"] },
  rowStrong: { fontSize: 16, fontWeight: "700" },
});
