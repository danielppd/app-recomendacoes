import { Image, StyleSheet, Text, View } from "react-native";
import type { PackItem } from "../types";
import { colors, radius, spacing, typeMeta } from "../constants/theme";

export function PackItemCard({ item }: { item: PackItem }) {
  const meta = typeMeta[item.type] ?? { label: item.type, color: colors.accent };
  return (
    <View style={styles.card}>
      <View style={styles.coverWrap}>
        {item.coverUrl ? (
          <Image source={{ uri: item.coverUrl }} style={styles.cover} resizeMode="cover" />
        ) : (
          <View style={[styles.cover, styles.coverPlaceholder]}>
            <Text style={styles.coverPlaceholderText}>{meta.label[0]}</Text>
          </View>
        )}
      </View>
      <View style={styles.body}>
        <View style={[styles.badge, { backgroundColor: meta.color + "22", borderColor: meta.color }]}>
          <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        {!!item.creator && (
          <Text style={styles.creator} numberOfLines={1}>
            {item.creator}
          </Text>
        )}
        {!!item.connectionPhrase && (
          <Text style={styles.phrase}>“{item.connectionPhrase}”</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  coverWrap: { width: 84 },
  cover: { width: 84, height: 120, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  coverPlaceholder: { alignItems: "center", justifyContent: "center" },
  coverPlaceholderText: { color: colors.textMuted, fontSize: 32, fontWeight: "800" },
  body: { flex: 1, gap: spacing.xs },
  badge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 11, fontWeight: "700" },
  title: { color: colors.text, fontSize: 17, fontWeight: "700" },
  creator: { color: colors.textMuted, fontSize: 14 },
  phrase: { color: colors.text, fontSize: 14, fontStyle: "italic", marginTop: spacing.xs, lineHeight: 20 },
});
