/**
 * Busca condições climáticas atuais via OpenWeatherMap.
 * Usado no cliente para exibir o contexto e no servidor para
 * enriquecer o prompt do Groq com informação situacional.
 */

export type WeatherContext = {
  temp: number;
  description: string; // em pt_br ("céu limpo", "chuva leve", etc.)
  city: string;
  period: "manhã" | "tarde" | "noite" | "madrugada";
};

const CACHE_KEY = "bubble_weather";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos

// São Paulo como fallback se o usuário negar geolocalização
const FALLBACK_LAT = -23.5505;
const FALLBACK_LON = -46.6333;

function detectPeriod(): WeatherContext["period"] {
  const h = new Date().getHours();
  if (h >= 6 && h < 12) return "manhã";
  if (h >= 12 && h < 18) return "tarde";
  if (h >= 18 && h < 24) return "noite";
  return "madrugada";
}

/** Tenta ler do sessionStorage; retorna null se expirado ou ausente. */
function readCache(): WeatherContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, ts, isFallback } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) return null;
    // Não usa cache de fallback — permite re-tentar com coordenadas reais
    if (isFallback) return null;
    return data as WeatherContext;
  } catch {
    return null;
  }
}

function writeCache(data: WeatherContext, isFallback: boolean) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now(), isFallback }));
}

/**
 * Pede geolocalização ao browser; resolve com fallback se negado/timeout.
 * enableHighAccuracy pede GPS/Wi-Fi quando disponível (em desktop costuma
 * cair em localização por IP, que aponta para o datacenter do ISP).
 */
function getCoords(): Promise<{ lat: number; lon: number; isFallback: boolean }> {
  return new Promise(async (resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ lat: FALLBACK_LAT, lon: FALLBACK_LON, isFallback: true });
      return;
    }

    // Checa estado da permissão para decidir se aplica timeout
    let permState: string = "prompt";
    try {
      const perm = await navigator.permissions.query({ name: "geolocation" });
      permState = perm.state;
    } catch {
      // Safari não suporta permissions.query
    }

    if (permState === "denied") {
      resolve({ lat: FALLBACK_LAT, lon: FALLBACK_LON, isFallback: true });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, isFallback: false }),
      () => resolve({ lat: FALLBACK_LAT, lon: FALLBACK_LON, isFallback: true }),
      {
        enableHighAccuracy: true,
        timeout: permState === "granted" ? 15000 : undefined,
      }
    );
  });
}

/**
 * Busca weather por nome de cidade (usado quando o usuário corrige manualmente).
 */
export async function fetchWeatherByCity(city: string): Promise<WeatherContext | null> {
  try {
    const res = await fetch(`/api/weather?city=${encodeURIComponent(city)}`);
    if (!res.ok) return null;
    const data: WeatherContext = await res.json();
    writeCache(data, false);
    return data;
  } catch {
    return null;
  }
}

/**
 * Retorna o contexto climático atual. Usa cache do sessionStorage (30min),
 * mas não reutiliza cache de fallback — sempre re-tenta geolocalização real.
 */
export async function fetchWeather(): Promise<WeatherContext | null> {
  const cached = readCache();
  if (cached) return cached;

  try {
    const { lat, lon, isFallback } = await getCoords();
    const res = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
    if (!res.ok) return null;
    const data: WeatherContext = await res.json();
    writeCache(data, isFallback);
    return data;
  } catch {
    return null;
  }
}

/**
 * Monta a linha de contexto situacional para injetar no prompt do Groq.
 * Retorna string vazia se não houver contexto disponível.
 */
export function buildWeatherPromptLine(ctx: WeatherContext): string {
  return `Contexto situacional: ${ctx.period} em ${ctx.city}, ${ctx.description}, ${ctx.temp}°C. Considere esse contexto para calibrar sutilmente o tom e a atmosfera das recomendações.`;
}
