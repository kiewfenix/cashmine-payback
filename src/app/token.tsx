import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { useToken } from "@/state/token";
import { Button } from "@/ui/Button";
import { colors, spacing } from "@/ui/theme";

export default function TokenScreen() {
  const router = useRouter();
  const { token, authError, setToken, clearToken } = useToken();
  const [value, setValue] = useState(token ?? "");
  const trimmed = value.trim();

  const save = () => {
    if (!trimmed) return;
    setToken(trimmed);
    router.replace("/");
  };

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Your CashMine API token</Text>
      <Text style={styles.hint}>
        Paste the token from your task email. It stays in this browser only and is sent to the API as a Bearer header.
      </Text>
      {authError ? <Text style={styles.error}>{authError}</Text> : null}
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder="ct1.…"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
        accessibilityLabel="API token"
        style={styles.input}
      />
      <Button title={token ? "Save new token" : "Save"} onPress={save} disabled={!trimmed} />
      {token ? (
        <View style={styles.secondary}>
          <Button
            title="Remove token"
            variant="secondary"
            onPress={() => {
              clearToken();
              setValue("");
            }}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: spacing.md, gap: spacing.md },
  title: { fontSize: 22, fontWeight: "700", color: colors.text },
  hint: { fontSize: 15, lineHeight: 21, color: colors.muted },
  error: { fontSize: 15, lineHeight: 21, color: colors.danger },
  input: {
    minHeight: 112,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.card,
    padding: spacing.md,
    fontSize: 15,
    color: colors.text,
  },
  secondary: { marginTop: spacing.sm },
});
