import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { errorMessage } from "@/api/client";
import { useApi } from "@/api/useApi";
import { colors, spacing } from "@/ui/theme";

type Check =
  | { status: "loading" }
  | { status: "ok"; asOf: string; assets: string[] }
  | { status: "error"; message: string };

/** Placeholder until the balances screen lands: proves the token and the API client work. */
export default function HomeScreen() {
  const api = useApi();
  const [check, setCheck] = useState<Check>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    api
      .balances(controller.signal)
      .then((balances) => setCheck({ status: "ok", asOf: balances.asOf, assets: balances.items.map((i) => i.asset) }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setCheck({ status: "error", message: errorMessage(error) });
      });
    return () => controller.abort();
  }, [api]);

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Balances coming next</Text>
      {check.status === "loading" ? <Text style={styles.muted}>Checking the API…</Text> : null}
      {check.status === "ok" ? (
        <Text style={styles.muted}>
          API reachable: {check.assets.join(", ")} as of {check.asOf}
        </Text>
      ) : null}
      {check.status === "error" ? <Text style={styles.error}>{check.message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: spacing.md, gap: spacing.sm },
  title: { fontSize: 20, fontWeight: "700", color: colors.text },
  muted: { fontSize: 15, color: colors.muted },
  error: { fontSize: 15, color: colors.danger },
});
