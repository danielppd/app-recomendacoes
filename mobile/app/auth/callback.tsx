// Rota de retorno do OAuth (deep link bubble://auth/callback).
// Processa a URL de retorno (caso ainda não tenha virado sessão) e leva à home,
// evitando a tela "Unmatched Route".
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { createSessionFromUrl } from "../../lib/auth";
import { colors } from "../../constants/theme";

export default function AuthCallback() {
  const router = useRouter();
  const url = Linking.useURL();

  useEffect(() => {
    let active = true;
    (async () => {
      if (url) {
        try {
          await createSessionFromUrl(url);
        } catch {
          // sessão pode já ter sido criada pelo fluxo principal
        }
      }
      if (active) router.replace("/");
    })();
    return () => {
      active = false;
    };
  }, [url, router]);

  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.accent} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
});
