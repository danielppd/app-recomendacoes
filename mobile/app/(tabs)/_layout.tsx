import { Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";
import { colors } from "../../constants/theme";

function icon(emoji: string) {
  return ({ color }: { color: ColorValue }) => (
    <Text style={{ fontSize: 18, color }}>{emoji}</Text>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: "700" },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Descobrir", tabBarIcon: icon("🫧") }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: "Histórico", tabBarIcon: icon("🕮") }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "Perfil", tabBarIcon: icon("👤") }}
      />
    </Tabs>
  );
}
