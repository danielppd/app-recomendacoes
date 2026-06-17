import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useCurrentPack } from "../store/pack";
import { PackItemCard } from "../components/PackItemCard";
import { sharePack } from "../lib/share";
import { savePack } from "../lib/packs";
import { colors, radius, spacing } from "../constants/theme";

export default function PackScreen() {
  const router = useRouter();
  const pack = useCurrentPack();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // Estado vazio (ex.: abriu a rota sem ter gerado um pack)
  if (!pack) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Nenhum pack por aqui ainda</Text>
        <Text style={styles.emptyText}>
          Volte e gere um pack a partir de uma vibe.
        </Text>
        <Pressable style={styles.button} onPress={() => router.replace("/")}>
          <Text style={styles.buttonText}>Voltar para a busca</Text>
        </Pressable>
      </View>
    );
  }

  const alreadySaved = saved || !!pack.savedId;

  async function handleShare() {
    try {
      await sharePack(pack!);
    } catch {
      Alert.alert("Não foi possível compartilhar", "Tente novamente.");
    }
  }

  async function handleSave() {
    if (alreadySaved || saving) return;
    setSaving(true);
    try {
      await savePack(pack!);
      setSaved(true);
    } catch (e) {
      Alert.alert("Não foi possível salvar", e instanceof Error ? e.message : "Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{pack.title}</Text>
      {!!pack.vibeDescription && (
        <Text style={styles.vibe}>{pack.vibeDescription}</Text>
      )}

      <View style={styles.list}>
        {pack.items.map((item) => (
          <PackItemCard key={item.id} item={item} />
        ))}
      </View>

      <View style={styles.actions}>
        <Pressable
          style={[styles.action, alreadySaved && styles.actionDisabled]}
          onPress={handleSave}
          disabled={alreadySaved || saving}
        >
          {saving ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.actionText}>{alreadySaved ? "Salvo ✓" : "Salvar"}</Text>
          )}
        </Pressable>
        <Pressable style={[styles.action, styles.actionPrimary]} onPress={handleShare}>
          <Text style={styles.actionText}>Compartilhar</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  title: { color: colors.text, fontSize: 26, fontWeight: "800" },
  vibe: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  list: { gap: spacing.md, marginTop: spacing.sm },
  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  action: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
  },
  actionDisabled: { opacity: 0.5 },
  actionPrimary: { backgroundColor: colors.accent },
  actionText: { color: colors.text, fontWeight: "700" },
  empty: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.md,
  },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: "700" },
  emptyText: { color: colors.textMuted, textAlign: "center" },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  buttonText: { color: colors.text, fontWeight: "700" },
});
