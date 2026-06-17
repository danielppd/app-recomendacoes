import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { ApiError, getPack } from "../../lib/api";
import { setCurrentPack } from "../../store/pack";
import { useWeather, weatherContext } from "../../lib/useWeather";
import { WeatherBadge } from "../../components/WeatherBadge";
import { colors, radius, spacing } from "../../constants/theme";

type Status = "idle" | "loading" | "error";

const SUGGESTIONS = ["domingo chuvoso", "Tame Impala", "nostalgia dos anos 90", "energia pra treinar"];

export default function HomeScreen() {
  const router = useRouter();
  const { weather, status: weatherStatus, reload: reloadWeather } = useWeather();
  const [mood, setMood] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const canSubmit = mood.trim().length > 0 && status !== "loading";

  async function handleGenerate() {
    const value = mood.trim();
    if (!value) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      // Injeta o contexto de clima/horário no mood (sem criar 2º seam no backend)
      const pack = await getPack(value + weatherContext(weather));
      setCurrentPack(pack);
      setStatus("idle");
      router.push("/pack");
    } catch (e) {
      setStatus("error");
      setErrorMsg(
        e instanceof ApiError ? e.message : "Algo deu errado. Tente novamente."
      );
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.kicker}>BUBBLE</Text>
        <Text style={styles.title}>O que você sente agora?</Text>
        <Text style={styles.subtitle}>
          Digite um artista, uma vibe ou um humor. A gente monta um pack com um
          filme, um livro, uma música e um lugar conectados por isso.
        </Text>

        <WeatherBadge
          weather={weather}
          status={weatherStatus}
          onRetry={reloadWeather}
        />

        <TextInput
          style={styles.input}
          placeholder="ex.: noite chuvosa ouvindo jazz"
          placeholderTextColor={colors.textMuted}
          value={mood}
          onChangeText={setMood}
          editable={status !== "loading"}
          onSubmitEditing={handleGenerate}
          returnKeyType="go"
          multiline
        />

        <View style={styles.chips}>
          {SUGGESTIONS.map((s) => (
            <Pressable
              key={s}
              onPress={() => setMood(s)}
              style={styles.chip}
              disabled={status === "loading"}
            >
              <Text style={styles.chipText}>{s}</Text>
            </Pressable>
          ))}
        </View>

        {status === "error" && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        )}

        <Pressable
          onPress={handleGenerate}
          disabled={!canSubmit}
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
        >
          {status === "loading" ? (
            <View style={styles.row}>
              <ActivityIndicator color={colors.text} />
              <Text style={styles.buttonText}>Montando seu pack…</Text>
            </View>
          ) : (
            <Text style={styles.buttonText}>Gerar pack</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, gap: spacing.md },
  kicker: {
    color: colors.accent,
    fontWeight: "800",
    letterSpacing: 4,
    fontSize: 12,
  },
  title: { color: colors.text, fontSize: 28, fontWeight: "800" },
  subtitle: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    color: colors.text,
    padding: spacing.md,
    fontSize: 16,
    minHeight: 56,
    marginTop: spacing.sm,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.xl,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  chipText: { color: colors.textMuted, fontSize: 13 },
  errorBox: {
    backgroundColor: "rgba(248,113,113,0.12)",
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: { color: colors.danger, fontSize: 14 },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.text, fontSize: 16, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
});
