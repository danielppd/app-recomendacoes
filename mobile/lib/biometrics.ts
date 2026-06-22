// Biometria (bônus de hardware) — desbloqueio do app.
import * as LocalAuthentication from "expo-local-authentication";
import AsyncStorage from "@react-native-async-storage/async-storage";

const ENABLED_KEY = "bubble.biometric.enabled";

/** Há sensor disponível E ao menos uma digital/face cadastrada? */
export async function isBiometricAvailable(): Promise<boolean> {
  const hasHw = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  return hasHw && enrolled;
}

export async function authenticate(): Promise<boolean> {
  const res = await LocalAuthentication.authenticateAsync({
    promptMessage: "Desbloquear o Bubble",
    cancelLabel: "Cancelar",
    disableDeviceFallback: false,
  });
  return res.success;
}

export async function isBiometricEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(ENABLED_KEY)) === "1";
}

export async function setBiometricEnabled(value: boolean): Promise<void> {
  await AsyncStorage.setItem(ENABLED_KEY, value ? "1" : "0");
}
