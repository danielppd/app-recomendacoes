// Camada de dados — SEAM ÚNICO de rede do app.
// Toda I/O HTTP com o backend Bubble passa por aqui. (Supabase SDK entra no M3.)
import type { Pack, Weather } from "../types";

const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? "";

if (!API_BASE) {
  console.warn(
    "[api] EXPO_PUBLIC_API_BASE não definido. Crie mobile/.env com EXPO_PUBLIC_API_BASE=http://SEU_IP:3000"
  );
}

/** Erro normalizado da borda de rede, com mensagem amigável para a UI. */
export class ApiError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const { timeoutMs = 25000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...rest,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(rest.headers ?? {}) },
    });
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new ApiError("A requisição demorou demais. Tente novamente.", e);
    }
    throw new ApiError(
      "Não foi possível conectar ao servidor. Verifique sua conexão.",
      e
    );
  }
  clearTimeout(timer);

  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.error ?? "";
    } catch {
      // resposta sem JSON
    }
    throw new ApiError(detail || `Erro ${res.status} ao falar com o servidor.`);
  }

  return (await res.json()) as T;
}

/** POST /api/pack — gera um pack (filme + livro + música + lugar). */
export function getPack(mood: string): Promise<Pack> {
  return request<Pack>("/api/pack", {
    method: "POST",
    body: JSON.stringify({ mood }),
  });
}

/** GET /api/weather — clima a partir de coordenadas (GPS). */
export function getWeather(lat: number, lon: number): Promise<Weather> {
  return request<Weather>(
    `/api/weather?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`,
    { method: "GET", timeoutMs: 10000 }
  );
}
