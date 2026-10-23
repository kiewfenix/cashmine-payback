import { StyleSheet, Text, View } from "react-native";

import { Button } from "./Button";
import { colors, spacing } from "./theme";

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
  tone?: "danger" | "warning";
}

export function ErrorBanner({ message, onRetry, retrying = false, tone = "danger" }: ErrorBannerProps) {
  return (
    <View style={[styles.banner, tone === "warning" ? styles.warning : styles.danger]} accessibilityRole="alert">
      <Text style={[styles.text, tone === "warning" ? styles.warningText : styles.dangerText]}>{message}</Text>
      {onRetry ? <Button title="Retry" variant="secondary" onPress={onRetry} loading={retrying} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { borderRadius: 12, padding: spacing.md, gap: spacing.sm },
  danger: { backgroundColor: colors.dangerBackground },
  warning: { backgroundColor: colors.warningBackground },
  text: { fontSize: 15, lineHeight: 21 },
  dangerText: { color: colors.danger },
  warningText: { color: colors.warning },
});
