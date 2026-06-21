import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useAuth } from "../../lib/auth";
import {
  disableDailyReco,
  enableDailyReco,
  isDailyRecoEnabled,
} from "../../lib/notifications";
import {
  isBiometricAvailable,
  isBiometricEnabled,
  setBiometricEnabled,
} from "../../lib/biometrics";
import { getLastWeather } from "../../store/weather";
import { colors, radius, spacing } from "../../constants/theme";

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const email = session?.user?.email ?? "—";

  const [dailyReco, setDailyReco] = useState(false);
  const [busy, setBusy] = useState(false);
  const [biometric, setBiometric] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  useEffect(() => {
    isDailyRecoEnabled().then(setDailyReco);
    isBiometricAvailable().then(setBiometricAvailable);
    isBiometricEnabled().then(setBiometric);
  }, []);

  async function toggleBiometric(next: boolean) {
    await setBiometricEnabled(next);
    setBiometric(next);
  }

  async function toggleDailyReco(next: boolean) {
    setBusy(true);
    try {
      if (next) {
        const ok = await enableDailyReco(getLastWeather());
        if (!ok) {
          Alert.alert(
            "Permissão necessária",
            "Ative as notificações nas configurações do sistema para receber a recomendação do dia."
          );
          setDailyReco(false);
          return;
        }
        setDailyReco(true);
      } else {
        await disableDailyReco();
        setDailyReco(false);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.label}>Conta</Text>
        <Text style={styles.email}>{email}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.email}>Recomendação do dia</Text>
            <Text style={styles.hint}>
              Uma notificação diária às 9h, com o clima do seu momento.
            </Text>
          </View>
          <Switch
            value={dailyReco}
            onValueChange={toggleDailyReco}
            disabled={busy}
            trackColor={{ true: colors.accent, false: colors.border }}
            thumbColor={colors.text}
          />
        </View>
      </View>

      {biometricAvailable && (
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.email}>Desbloqueio por biometria</Text>
              <Text style={styles.hint}>
                Pedir biometria ao abrir o app.
              </Text>
            </View>
            <Switch
              value={biometric}
              onValueChange={toggleBiometric}
              trackColor={{ true: colors.accent, false: colors.border }}
              thumbColor={colors.text}
            />
          </View>
        </View>
      )}

      <Pressable style={styles.logout} onPress={signOut}>
        <Text style={styles.logoutText}>Sair</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg, gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  label: { color: colors.textMuted, fontSize: 13 },
  email: { color: colors.text, fontSize: 17, fontWeight: "600" },
  hint: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  rowText: { flex: 1 },
  logout: {
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
    marginTop: "auto",
  },
  logoutText: { color: colors.danger, fontWeight: "700" },
});
