// Cliente mínimo da Spotify Web API.
// Fluxo OAuth Authorization Code: o usuário aprova → callback troca code por
// tokens → usamos o access_token para puxar top artists/tracks.

export const SPOTIFY_SCOPES = ["user-top-read", "user-read-private", "user-read-email"];

const ACCOUNTS = "https://accounts.spotify.com";
const API = "https://api.spotify.com/v1";

// URL para redirecionar o usuário ao Spotify para consentimento.
export function buildAuthUrl(state: string): string {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    scope: SPOTIFY_SCOPES.join(" "),
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
    state,
  });
  return `${ACCOUNTS}/authorize?${p.toString()}`;
}

// Troca o code recebido no callback por access_token + refresh_token.
export async function exchangeCodeForTokens(code: string) {
  const basic = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
    }),
  });
  if (!res.ok) throw new Error(`Spotify token exchange: ${await res.text()}`);
  return res.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
    scope: string;
  }>;
}

// Renova o access_token usando o refresh_token guardado.
export async function refreshAccessToken(refreshToken: string) {
  const basic = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString("base64");
  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error(`Spotify refresh: ${await res.text()}`);
  return res.json();
}

async function spotifyGet(path: string, token: string) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Spotify ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function getMe(token: string) {
  return spotifyGet("/me", token);
}

// Top artists do usuário — long_term ≈ últimos ~12 meses, ótimo para capturar
// a "vibe persistente" em vez do hype momentâneo.
export async function getTopArtists(token: string, limit = 10) {
  const json = await spotifyGet(`/me/top/artists?time_range=long_term&limit=${limit}`, token);
  return json.items as Array<{
    id: string;
    name: string;
    genres: string[];
    images: { url: string }[];
  }>;
}

export async function getTopTracks(token: string, limit = 20) {
  const json = await spotifyGet(`/me/top/tracks?time_range=long_term&limit=${limit}`, token);
  return json.items as Array<{
    id: string;
    name: string;
    artists: { name: string }[];
    album: { images: { url: string }[] };
  }>;
}
