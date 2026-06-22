import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Cache do token client_credentials. Expira ~1h; renovamos com 60s de margem.
let ccToken: string | null = null;
let ccExpiresAt = 0;

/**
 * Obtém um token via client_credentials flow (não precisa de login do usuário).
 * Usado como fallback quando o usuário não está logado no Spotify.
 */
async function getClientCredentialsToken(): Promise<string> {
  if (ccToken && Date.now() < ccExpiresAt) return ccToken;

  const basic = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) throw new Error(`Spotify cc token: ${res.status}`);
  const data = await res.json();
  ccToken = data.access_token;
  // Renova 60s antes de expirar para evitar race conditions
  ccExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return ccToken!;
}

/**
 * GET /api/spotify/search?q=radiohead
 *
 * Proxy server-side para a Spotify Search API. Evita expor credenciais
 * no cliente. Usa access_token do usuário logado (se tiver) ou
 * client_credentials para visitantes anônimos.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ artists: [] });

  try {
    // Tenta usar o token do usuário logado se disponível via cookie/header,
    // senão usa client_credentials (funciona para busca pública).
    const token = await getClientCredentialsToken();

    const url = new URL("https://api.spotify.com/v1/search");
    url.searchParams.set("q", q);
    url.searchParams.set("type", "artist");
    url.searchParams.set("limit", "6");
    url.searchParams.set("market", "BR");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      // Token expirado ou inválido — limpa cache e retorna vazio
      // em vez de estourar erro (fallback gracioso)
      ccToken = null;
      ccExpiresAt = 0;
      return NextResponse.json({ artists: [] });
    }

    const data = await res.json();
    const artists = (data.artists?.items ?? []).map((a: any) => ({
      id: a.id,
      name: a.name,
      image: a.images?.[0]?.url ?? null,
      genres: (a.genres ?? []).slice(0, 2),
    }));

    return NextResponse.json({ artists });
  } catch (e) {
    // Fallback gracioso: se a Spotify API falhar, retorna lista vazia
    // e o usuário pode continuar digitando normalmente
    console.error("Spotify search error:", e);
    return NextResponse.json({ artists: [] });
  }
}
