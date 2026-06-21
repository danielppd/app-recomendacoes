// Notificações LOCAIS — "recomendação do dia".
// Agenda uma notificação diária recorrente com texto context-aware (clima).
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Weather } from "../types";

const TOGGLE_KEY = "bubble.dailyReco.enabled";
const HOUR = 9; // dispara às 9h
const MINUTE = 0;

// Mostra a notificação mesmo com o app em primeiro plano.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status === "granted") return true;
  const { status: asked } = await Notifications.requestPermissionsAsync();
  return asked === "granted";
}

function bodyFor(weather: Weather | null): string {
  if (weather) {
    return `${weather.period} de ${weather.description} em ${weather.city} (${weather.temp}°C). Que tal um pack pra esse momento?`;
  }
  return "Abra o Bubble e descubra um filme, um livro, uma música e um lugar conectados pela sua vibe.";
}

/** Liga a notificação diária. Retorna false se a permissão for negada. */
export async function enableDailyReco(weather: Weather | null): Promise<boolean> {
  const ok = await requestNotificationPermission();
  if (!ok) return false;

  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Sua recomendação do dia 🫧",
      body: bodyFor(weather),
      data: { route: "/" },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: HOUR,
      minute: MINUTE,
    },
  });
  await AsyncStorage.setItem(TOGGLE_KEY, "1");
  return true;
}

export async function disableDailyReco(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await AsyncStorage.setItem(TOGGLE_KEY, "0");
}

export async function isDailyRecoEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(TOGGLE_KEY)) === "1";
}
