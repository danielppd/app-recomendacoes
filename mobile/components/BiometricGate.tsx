import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { authenticate, isBiometricEnabled } from "../lib/biometrics";
import { colors, radius, spacing } from "../constants/theme";

// Trava o conteúdo até a biometria ser aprovada, quando o usuário ativou o
// recurso. Se desativado/indisponível, libera direto.
export function BiometricGate({ children }: { children: ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [unlocked, setUnlocked] = useState(false);

  async function tryUnlock() {
    const ok = await authenticate();
    setUnlocked(ok);
  }

  useEffect(() => {
    (async () => {
      const enabled = await isBiometricEnabled();
      if (!enabled) {
        setUnlocked(true);
        setChecking(false);
        return;
      }
      setChecking(false);
      const ok = await authenticate();
      setUnlocked(ok);
    })();
  }, []);

  if (checking) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (!unlocked) {
    return (
      <View style={styles.center}>
        <Text style={styles.lock}>🔒</Text>
        <Text style={styles.title}>Bubble bloqueado</Text>
        <Pressable style={styles.button} onPress={tryUnlock}>
          <Text style={styles.buttonText}>Desbloquear</Text>
        </Pressable>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
  },
  lock: { fontSize: 48 },
  title: { color: colors.text, fontSize: 20, fontWeight: "700" },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  buttonText: { color: colors.text, fontWeight: "700" },
});
