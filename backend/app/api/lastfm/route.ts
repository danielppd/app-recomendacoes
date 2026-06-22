import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getTopArtists } from "@/lib/lastfm";
import { buildVibeCentroid, weightedAverage } from "@/lib/vibe";

export const runtime = "nodejs";

/**
 * POST /api/lastfm — conecta Last.fm ao perfil do usuário.
 * Body: { username: string }
 *
 * Pipeline:
 *   1. Valida o username buscando top artists
 *   2. Gera centroide de vibe dos top 5 artistas
 *   3. Se o usuário já tem Spotify vibe_embedding: mescla 60% Spotify + 40% Last.fm
 *      Senão: usa 100% Last.fm
 *   4. Salva lastfm_username e atualiza vibe_embedding no perfil
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  try {
    const { username } = await req.json();
    if (!username || typeof username !== "string") {
      return NextResponse.json({ error: "username required" }, { status: 400 });
    }

    const trimmed = username.trim();

    // 1. Busca top artistas — se o username não existir, Last.fm retorna erro
    const topArtists = await getTopArtists(trimmed, 10);
    if (topArtists.length === 0) {
      return NextResponse.json({ error: "Nenhum artista encontrado para esse usuário" }, { status: 404 });
    }

    // 2. Gera centroide dos top 5
    const topNames = topArtists.slice(0, 5).map((a) => a.name);
    const lastfmVibe = await buildVibeCentroid(topNames);

    // 3. Checa se já tem vibe do Spotify para mesclar
    const { data: prof } = await supabase
      .from("profiles")
      .select("vibe_embedding, spotify_id")
      .eq("id", user.id)
      .single();

    let finalVibe = lastfmVibe;
    const hasSpotify = prof?.spotify_id && prof?.vibe_embedding;
    if (hasSpotify) {
      const spotifyVec = Array.isArray(prof.vibe_embedding)
        ? prof.vibe_embedding
        : JSON.parse(prof.vibe_embedding);
      // Spotify 60% + Last.fm 40% quando ambos existem
      finalVibe = weightedAverage(spotifyVec, lastfmVibe, 0.6, 0.4);
    }

    // 4. Salva no perfil
    await supabase
      .from("profiles")
      .update({
        lastfm_username: trimmed,
        vibe_embedding: finalVibe,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    return NextResponse.json({
      username: trimmed,
      artistCount: topArtists.length,
      topArtists: topArtists.slice(0, 5).map((a) => a.name),
      mergedWithSpotify: !!hasSpotify,
    });
  } catch (e: any) {
    console.error("Last.fm connect error:", e);
    return NextResponse.json({ error: e.message ?? "Failed to connect Last.fm" }, { status: 500 });
  }
}
