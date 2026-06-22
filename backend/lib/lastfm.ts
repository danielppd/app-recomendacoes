/**
 * Cliente Last.fm. API pública e gratuita — só precisa de API key, sem OAuth.
 * Usado para enriquecer o perfil de vibe com dados de scrobbling longos.
 */

const BASE = "https://ws.audioscrobbler.com/2.0/";

function buildUrl(method: string, user: string, limit: number): string {
  const key = process.env.LASTFM_API_KEY?.trim();
  if (!key) throw new Error("LASTFM_API_KEY not set");
  const params = new URLSearchParams({
    method,
    user,
    api_key: key,
    format: "json",
    period: "6month",
    limit: String(limit),
  });
  return `${BASE}?${params}`;
}

export type LastfmArtist = {
  name: string;
  playcount: string;
  url: string;
  image: string | null;
};

export type LastfmTrack = {
  name: string;
  artist: string;
  playcount: string;
  url: string;
};

/** Top artistas dos últimos 6 meses. */
export async function getTopArtists(username: string, limit = 10): Promise<LastfmArtist[]> {
  const res = await fetch(buildUrl("user.gettopartists", username, limit));
  if (!res.ok) throw new Error(`Last.fm error: ${res.status}`);
  const data = await res.json();

  if (data.error) throw new Error(data.message ?? "Last.fm user not found");

  return (data.topartists?.artist ?? []).map((a: any) => ({
    name: a.name,
    playcount: a.playcount,
    url: a.url,
    // Last.fm retorna array de imagens de tamanhos diferentes
    image: a.image?.find((i: any) => i.size === "large")?.["#text"] || null,
  }));
}

/** Top tracks dos últimos 6 meses. */
export async function getTopTracks(username: string, limit = 20): Promise<LastfmTrack[]> {
  const res = await fetch(buildUrl("user.gettoptracks", username, limit));
  if (!res.ok) throw new Error(`Last.fm error: ${res.status}`);
  const data = await res.json();

  if (data.error) throw new Error(data.message ?? "Last.fm user not found");

  return (data.toptracks?.track ?? []).map((t: any) => ({
    name: t.name,
    artist: t.artist?.name ?? "",
    playcount: t.playcount,
    url: t.url,
  }));
}

/** Valida se um username Last.fm existe tentando buscar 1 artista. */
export async function validateUsername(username: string): Promise<boolean> {
  try {
    const artists = await getTopArtists(username, 1);
    return true;
  } catch {
    return false;
  }
}
