import { Stack, useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "@/ui/theme";

/** Placeholder: the claim flow is the next step. */
export default function ClaimScreen() {
  const { asset } = useLocalSearchParams<{ asset: string }>();
  return (
    <>
      <Stack.Screen options={{ title: `Claim ${asset}` }} />
      <View style={styles.screen}>
        <Text style={styles.text}>Claim flow coming next.</Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: spacing.md },
  text: { fontSize: 15, color: colors.muted },
});
