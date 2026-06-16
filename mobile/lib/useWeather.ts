// Hook de hardware: GPS (expo-location) → /api/weather.
// Pede permissão, obtém coordenadas e busca o clima. Degrada em silêncio se
// a permissão for negada (o fluxo de pack continua funcionando sem contexto).
import { useCallback, useEffect, useState } from "react";
import * as Location from "expo-location";
import { getWeather } from "./api";
import { setLastWeather } from "../store/weather";
import type { Weather } from "../types";

type Status = "idle" | "loading" | "ready" | "denied" | "error";

export function useWeather() {
  const [weather, setWeather] = useState<Weather | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== "granted") {
        setStatus("denied");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Low,
      });
      const w = await getWeather(pos.coords.latitude, pos.coords.longitude);
      setWeather(w);
      setLastWeather(w);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { weather, status, reload: load };
}

/** Monta a string de contexto injetada no mood enviado ao /api/pack. */
export function weatherContext(w: Weather | null): string {
  if (!w) return "";
  return ` (contexto: ${w.period} em ${w.city}, ${w.description}, ${w.temp}°C)`;
}
