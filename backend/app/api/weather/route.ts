import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function detectPeriod(): string {
  const h = new Date().getHours();
  if (h >= 6 && h < 12) return "manhã";
  if (h >= 12 && h < 18) return "tarde";
  if (h >= 18 && h < 24) return "noite";
  return "madrugada";
}

/**
 * GET /api/weather?lat=-23.55&lon=-46.63
 *
 * Proxy para OpenWeatherMap. Mantém a API key no servidor.
 * Retorna { temp, description, city, period } ou erro.
 */
export async function GET(req: NextRequest) {
  const lat = req.nextUrl.searchParams.get("lat");
  const lon = req.nextUrl.searchParams.get("lon");
  const city = req.nextUrl.searchParams.get("city");

  const apiKey = process.env.OPENWEATHER_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "OPENWEATHER_API_KEY not set" }, { status: 500 });
  }

  // Aceita busca por cidade OU por coordenadas
  let url: string;
  if (city) {
    url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&lang=pt_br&units=metric`;
  } else if (lat && lon) {
    url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&lang=pt_br&units=metric`;
  } else {
    return NextResponse.json({ error: "lat/lon or city required" }, { status: 400 });
  }

  try {
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      console.error("OpenWeather error:", res.status, text);
      return NextResponse.json({ error: "weather API error" }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json({
      temp: Math.round(data.main.temp),
      description: data.weather[0].description,
      city: data.name,
      period: detectPeriod(),
    });
  } catch (e: any) {
    console.error("Weather fetch error:", e);
    return NextResponse.json({ error: "failed to fetch weather" }, { status: 500 });
  }
}
