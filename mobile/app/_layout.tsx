import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { AuthProvider, useAuth } from "../lib/auth";
import { BiometricGate } from "../components/BiometricGate";
import { colors } from "../constants/theme";

// Tocar na notificação "recomendação do dia" leva o usuário à Home.
function useNotificationTap() {
  const router = useRouter();
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const route = resp.notification.request.content.data?.route;
      if (typeof route === "string") router.push(route as never);
    });
    return () => sub.remove();
  }, [router]);
}

// Guard de rota: sem sessão → /login; com sessão na tela de login → tabs.
function useProtectedRoute(hasSession: boolean, loading: boolean) {
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    // "login" e "auth" (callback do OAuth) não são protegidos
    const inAuthGroup = segments[0] === "login" || segments[0] === "auth";
    if (!hasSession && !inAuthGroup) {
      router.replace("/login");
    } else if (hasSession && segments[0] === "login") {
      router.replace("/");
    }
  }, [hasSession, loading, segments, router]);
}

function RootNavigator() {
  const { session, loading } = useAuth();
  useProtectedRoute(!!session, loading);
  useNotificationTap();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  const stack = (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: "700" },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
      <Stack.Screen name="pack" options={{ title: "Seu pack" }} />
    </Stack>
  );

  // Biometria só faz sentido para quem já tem sessão.
  return session ? <BiometricGate>{stack}</BiometricGate> : stack;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <RootNavigator />
    </AuthProvider>
  );
}
