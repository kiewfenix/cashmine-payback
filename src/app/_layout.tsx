import { Link, Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { TokenProvider, useToken } from "@/state/token";
import { colors, FRAME_MAX_WIDTH, spacing } from "@/ui/theme";

export default function RootLayout() {
  return (
    <TokenProvider>
      <View style={styles.outer}>
        <View style={styles.frame}>
          <RootStack />
        </View>
      </View>
    </TokenProvider>
  );
}

function RootStack() {
  const { token } = useToken();
  return (
    <Stack
      screenOptions={{
        headerTitleAlign: "center",
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
        headerRight: () => <TokenLink />,
      }}
    >
      <Stack.Screen name="token" options={{ title: "API token", headerRight: undefined }} />
      {/* Everything below needs a token; without one the router falls back to the token screen. */}
      <Stack.Protected guard={token !== null}>
        <Stack.Screen name="index" options={{ title: "Payback" }} />
        <Stack.Screen name="claim/[asset]" options={{ title: "Claim" }} />
      </Stack.Protected>
    </Stack>
  );
}

function TokenLink() {
  return (
    <Link href="/token" accessibilityLabel="Change API token" style={styles.headerLink}>
      <Text style={styles.headerLinkText}>Token</Text>
    </Link>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, alignItems: "center", backgroundColor: colors.background },
  frame: { flex: 1, width: "100%", maxWidth: FRAME_MAX_WIDTH },
  headerLink: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  headerLinkText: { color: colors.accent, fontSize: 16, fontWeight: "600" },
});
