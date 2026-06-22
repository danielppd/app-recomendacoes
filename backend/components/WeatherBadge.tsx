"use client";
import { useEffect, useState, useRef } from "react";
import { fetchWeather, fetchWeatherByCity, type WeatherContext } from "@/lib/weather";

// Mapa de descrição do OpenWeather para emoji representativo
const WEATHER_ICONS: Record<string, string> = {
  "céu limpo": "☀️",
  "algumas nuvens": "⛅",
  "nuvens dispersas": "🌤️",
  "nublado": "☁️",
  "nuvens quebradas": "☁️",
  "chuva leve": "🌧️",
  "chuva moderada": "🌧️",
  "chuva forte": "⛈️",
  "trovoada": "⛈️",
  "neve": "🌨️",
  "neblina": "🌫️",
  "névoa": "🌫️",
};

function getIcon(description: string): string {
  const lower = description.toLowerCase();
  for (const [key, icon] of Object.entries(WEATHER_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return "🌡️";
}

/**
 * Badge discreta mostrando clima atual. Clique na cidade para corrigir
 * manualmente caso a geolocalização erre (comum em desktop — IP aponta
 * para o datacenter do ISP, não para a cidade real do usuário).
 */
export default function WeatherBadge({
  onLoad,
}: {
  onLoad?: (ctx: WeatherContext) => void;
}) {
  const [weather, setWeather] = useState<WeatherContext | null>(null);
  const [editing, setEditing] = useState(false);
  const [cityInput, setCityInput] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchWeather().then((ctx) => {
      if (ctx) {
        setWeather(ctx);
        onLoad?.(ctx);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function handleCitySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cityInput.trim()) return;
    setLoading(true);
    const ctx = await fetchWeatherByCity(cityInput.trim());
    if (ctx) {
      setWeather(ctx);
      onLoad?.(ctx);
    }
    setEditing(false);
    setLoading(false);
    setCityInput("");
  }

  if (!weather) return null;

  return (
    <div className="text-right mt-3 text-xs text-neutral-500 animate-fade-in">
      {editing ? (
        <form onSubmit={handleCitySubmit} className="inline-flex items-center gap-1">
          <input
            ref={inputRef}
            type="text"
            value={cityInput}
            onChange={(e) => setCityInput(e.target.value)}
            placeholder="sua cidade"
            disabled={loading}
            className="bg-transparent border-b border-neutral-600 outline-none text-xs text-neutral-300 w-28 text-right"
            onBlur={() => { if (!cityInput.trim()) setEditing(false); }}
          />
          <button type="submit" disabled={loading} className="text-neutral-400 hover:text-white">
            {loading ? "..." : "ok"}
          </button>
        </form>
      ) : (
        <>
          {getIcon(weather.description)}{" "}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="hover:text-neutral-300 transition border-b border-dotted border-neutral-700"
            title="Clique para corrigir a cidade"
          >
            {weather.city}
          </button>
          {" "}· {weather.temp}°C · {weather.period}
        </>
      )}
    </div>
  );
}
