import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import { colors, spacing } from "./theme";

interface HeaderButtonProps {
  title: string;
  onPress: () => void;
  busy?: boolean;
}

export function HeaderButton({ title, onPress, busy = false }: HeaderButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      {busy ? <ActivityIndicator size="small" color={colors.accent} /> : <Text style={styles.text}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minWidth: 72, alignItems: "center" },
  pressed: { opacity: 0.6 },
  text: { color: colors.accent, fontSize: 16, fontWeight: "600" },
});
