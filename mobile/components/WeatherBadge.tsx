import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { Weather } from "../types";
import { colors, radius, spacing } from "../constants/theme";

type Props = {
  weather: Weather | null;
  status: "idle" | "loading" | "ready" | "denied" | "error";
  onRetry: () => void;
};

export function WeatherBadge({ weather, status, onRetry }: Props) {
  if (status === "loading") {
    return (
      <View style={styles.badge}>
        <ActivityIndicator size="small" color={colors.textMuted} />
        <Text style={styles.text}>Lendo seu contexto…</Text>
      </View>
    );
  }

  if (status === "ready" && weather) {
    return (
      <View style={styles.badge}>
        <Text style={styles.dot}>◉</Text>
        <Text style={styles.text}>
          {weather.city} · {weather.temp}°C · {weather.description} · {weather.period}
        </Text>
      </View>
    );
  }

  if (status === "denied" || status === "error") {
    return (
      <Pressable style={styles.badge} onPress={onRetry}>
        <Text style={styles.text}>
          {status === "denied"
            ? "Sem localização — toque para permitir"
            : "Falha ao ler o clima — toque para tentar"}
        </Text>
      </Pressable>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    alignSelf: "flex-start",
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.xl,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  dot: { color: colors.accent, fontSize: 12 },
  text: { color: colors.textMuted, fontSize: 13 },
});
