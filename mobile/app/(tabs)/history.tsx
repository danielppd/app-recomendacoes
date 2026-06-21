import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { listSavedPacks, savedToPack, type SavedPack } from "../../lib/packs";
import { setCurrentPack } from "../../store/pack";
import { typeMeta, colors, radius, spacing } from "../../constants/theme";

type Status = "loading" | "ready" | "error";

export default function HistoryScreen() {
  const router = useRouter();
  const [packs, setPacks] = useState<SavedPack[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await listSavedPacks();
      setPacks(data);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  // Recarrega sempre que a aba ganha foco (ex.: depois de salvar um pack)
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function open(p: SavedPack) {
    setCurrentPack(savedToPack(p));
    router.push("/pack");
  }

  if (status === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (status === "error") {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Não foi possível carregar</Text>
        <Pressable style={styles.retry} onPress={load}>
          <Text style={styles.retryText}>Tentar de novo</Text>
        </Pressable>
      </View>
    );
  }

  if (packs.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Nada salvo ainda</Text>
        <Text style={styles.emptyText}>
          Gere um pack e toque em Salvar para vê-lo aqui.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.flex}
      contentContainerStyle={styles.list}
      data={packs}
      keyExtractor={(p) => p.id}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
      }
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => open(item)}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.title}
          </Text>
          {!!item.mood_input && (
            <Text style={styles.cardMood} numberOfLines={1}>
              {item.mood_input}
            </Text>
          )}
          <Text style={styles.cardItems}>
            {item.items.map((it) => typeMeta[it.type]?.label ?? it.type).join(" · ")}
          </Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.lg, gap: spacing.md },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.sm,
  },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: "700" },
  emptyText: { color: colors.textMuted, textAlign: "center" },
  retry: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  retryText: { color: colors.text, fontWeight: "700" },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: "700" },
  cardMood: { color: colors.textMuted, fontSize: 14, fontStyle: "italic" },
  cardItems: { color: colors.accent, fontSize: 13, marginTop: spacing.xs },
});
