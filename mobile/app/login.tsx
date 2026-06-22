import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../lib/auth";
import { colors, radius, spacing } from "../constants/theme";

type Mode = "signIn" | "signUp";

export default function LoginScreen() {
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  const canSubmit = email.trim().length > 3 && password.length >= 6 && !loading;

  async function handleGoogle() {
    setGoogleLoading(true);
    setMessage(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Falha no login com Google." });
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setLoading(true);
    setMessage(null);
    try {
      if (mode === "signIn") {
        await signIn(email.trim(), password);
        // o guard de rota redireciona ao detectar a sessão
      } else {
        const { needsConfirmation } = await signUp(email.trim(), password);
        if (needsConfirmation) {
          setMessage({
            kind: "info",
            text: "Conta criada! Confirme seu e-mail e depois faça login.",
          });
          setMode("signIn");
        }
      }
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Falha ao autenticar." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.container}>
        <Text style={styles.brand}>🫧 Bubble</Text>
        <Text style={styles.subtitle}>
          {mode === "signIn" ? "Entre para continuar" : "Crie sua conta"}
        </Text>

        <TextInput
          style={styles.input}
          placeholder="E-mail"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
          editable={!loading}
        />
        <TextInput
          style={styles.input}
          placeholder="Senha (mín. 6 caracteres)"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          editable={!loading}
          onSubmitEditing={handleSubmit}
        />

        {message && (
          <Text style={message.kind === "error" ? styles.error : styles.info}>
            {message.text}
          </Text>
        )}

        <Pressable
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
        >
          {loading ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={styles.buttonText}>
              {mode === "signIn" ? "Entrar" : "Cadastrar"}
            </Text>
          )}
        </Pressable>

        <View style={styles.divider}>
          <View style={styles.line} />
          <Text style={styles.dividerText}>ou</Text>
          <View style={styles.line} />
        </View>

        <Pressable
          style={[styles.googleButton, googleLoading && styles.buttonDisabled]}
          onPress={handleGoogle}
          disabled={googleLoading || loading}
        >
          {googleLoading ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.googleText}>Continuar com Google</Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => {
            setMode(mode === "signIn" ? "signUp" : "signIn");
            setMessage(null);
          }}
          disabled={loading}
        >
          <Text style={styles.switch}>
            {mode === "signIn"
              ? "Não tem conta? Cadastre-se"
              : "Já tem conta? Entrar"}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, justifyContent: "center", padding: spacing.lg, gap: spacing.md },
  brand: { color: colors.text, fontSize: 34, fontWeight: "800", textAlign: "center" },
  subtitle: { color: colors.textMuted, fontSize: 16, textAlign: "center", marginBottom: spacing.md },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    color: colors.text,
    padding: spacing.md,
    fontSize: 16,
  },
  error: { color: colors.danger, fontSize: 14 },
  info: { color: colors.accent, fontSize: 14 },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.onAccent, fontSize: 16, fontWeight: "700" },
  divider: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginVertical: spacing.xs },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.textMuted, fontSize: 13 },
  googleButton: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
  },
  googleText: { color: colors.text, fontSize: 16, fontWeight: "600" },
  switch: { color: colors.textMuted, textAlign: "center", marginTop: spacing.md },
});
