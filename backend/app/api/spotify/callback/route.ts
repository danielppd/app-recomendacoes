// Callback do Spotify OAuth.
// 1. Valida state
// 2. Troca code por tokens
// 3. Puxa /me, top artists e top tracks
// 4. Calcula centroide dos top 5 artistas (buildVibeCentroid)
// 5. Salva tudo no profile do usuário
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { exchangeCodeForTokens, getMe, getTopArtists, getTopTracks } from "@/lib/spotify";
import { buildVibeCentroid } from "@/lib/vibe";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = req.cookies.get("spotify_state")?.value;

  const site = process.env.NEXT_PUBLIC_SITE_URL!;

  if (!code || !state || state !== cookieState) {
    return NextResponse.redirect(`${site}/profile?error=state_mismatch`);
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${site}/login`);

  try {
    const tokens = await exchangeCodeForTokens(code);
    const [me, topArtists, topTracks] = await Promise.all([
      getMe(tokens.access_token),
      getTopArtists(tokens.access_token, 10),
      getTopTracks(tokens.access_token, 20),
    ]);

    // Centroide dos 5 principais artistas
    const topNames = topArtists.slice(0, 5).map((a) => a.name);
    const vibeEmbedding = await buildVibeCentroid(topNames);

    // Tags de vibe = união dos gêneros dos top 5 (limit 5 distintos)
    const genreCount = new Map<string, number>();
    for (const a of topArtists.slice(0, 5)) {
      for (const g of a.genres) genreCount.set(g, (genreCount.get(g) ?? 0) + 1);
    }
    const vibeTags = [...genreCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([g]) => g);

    await supabase.from("profiles").update({
      spotify_id: me.id,
      spotify_access_token: tokens.access_token,
      spotify_refresh_token: tokens.refresh_token,
      spotify_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      top_artists: topArtists.map((a) => ({
        id: a.id,
        name: a.name,
        image: a.images[0]?.url ?? null,
        genres: a.genres,
      })),
      top_tracks: topTracks.map((t) => ({
        id: t.id,
        name: t.name,
        artists: t.artists.map((x) => x.name),
        image: t.album.images[0]?.url ?? null,
      })),
      vibe_embedding: vibeEmbedding,
      vibe_tags: vibeTags,
      updated_at: new Date().toISOString(),
    }).eq("id", user.id);

    const res = NextResponse.redirect(`${site}/profile`);
    res.cookies.delete("spotify_state");
    return res;
  } catch (e: any) {
    console.error(e);
    return NextResponse.redirect(`${site}/profile?error=${encodeURIComponent(e.message)}`);
  }
}
