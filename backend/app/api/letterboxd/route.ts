import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchLetterboxdDiary } from "@/lib/letterboxd";

export const runtime = "nodejs";

/**
 * POST /api/letterboxd — conecta Letterboxd ao perfil.
 * Body: { username: string }
 *
 * Pipeline:
 *   1. Fetch do RSS para validar e extrair filmes
 *   2. Busca títulos no catalog_items por ILIKE
 *   3. Para cada match: pega o embedding existente para compor o perfil
 *   4. Salva letterboxd_data (cache) e letterboxd_username no perfil
 *   5. Se encontrou matches no catálogo, mescla embeddings ao perfil (peso 30%)
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

    // 1. Fetch do diary
    const entries = await fetchLetterboxdDiary(trimmed);

    // 2. Busca cada título no catálogo
    let matchCount = 0;
    const matchedEmbeddings: number[][] = [];

    for (const entry of entries) {
      // Busca por similaridade de título no catálogo (case-insensitive)
      const { data: items } = await supabaseAdmin
        .from("catalog_items")
        .select("id, title, embedding")
        .eq("type", "film")
        .ilike("title", `%${entry.title}%`)
        .limit(1);

      if (items && items.length > 0 && items[0].embedding) {
        matchCount++;
        const emb = Array.isArray(items[0].embedding)
          ? items[0].embedding
          : JSON.parse(items[0].embedding);
        matchedEmbeddings.push(emb);
      }
    }

    // 3. Se tem matches, calcula centroide e mescla ao perfil (peso 30%)
    if (matchedEmbeddings.length > 0) {
      const dim = matchedEmbeddings[0].length;
      const centroid = new Array(dim).fill(0);
      for (const emb of matchedEmbeddings) {
        for (let i = 0; i < dim; i++) centroid[i] += emb[i];
      }
      for (let i = 0; i < dim; i++) centroid[i] /= matchedEmbeddings.length;

      // Mescla com embedding existente se houver
      const { data: prof } = await supabase
        .from("profiles")
        .select("vibe_embedding")
        .eq("id", user.id)
        .single();

      let finalVibe = centroid;
      if (prof?.vibe_embedding) {
        const existing = Array.isArray(prof.vibe_embedding)
          ? prof.vibe_embedding
          : JSON.parse(prof.vibe_embedding);
        // 70% existente + 30% Letterboxd
        finalVibe = existing.map((v: number, i: number) =>
          (v * 0.7 + centroid[i] * 0.3)
        );
      }

      await supabase
        .from("profiles")
        .update({ vibe_embedding: finalVibe })
        .eq("id", user.id);
    }

    // 4. Salva dados do Letterboxd no perfil (cache 24h)
    await supabase
      .from("profiles")
      .update({
        letterboxd_username: trimmed,
        letterboxd_data: entries,
        letterboxd_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    return NextResponse.json({
      username: trimmed,
      totalEntries: entries.length,
      matchedInCatalog: matchCount,
    });
  } catch (e: any) {
    console.error("Letterboxd error:", e);
    return NextResponse.json({ error: e.message ?? "Failed to connect Letterboxd" }, { status: 500 });
  }
}
