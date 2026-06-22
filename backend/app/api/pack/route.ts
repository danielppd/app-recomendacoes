import { NextRequest, NextResponse } from "next/server";
import { generateVibeDescription, generatePackMeta } from "@/lib/groq";
import { embedText } from "@/lib/gemini";
import { supabaseAdmin } from "@/lib/supabase";
import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

// Tipos que compõem um pack: exatamente 1 de cada domínio
const PACK_TYPES = ["film", "book", "music", "place"] as const;

/**
 * POST /api/pack
 * Body: { mood: string, save?: boolean }
 *
 * Pipeline:
 *   1. Groq interpreta o mood → vibe_description detalhada (prompt "mood")
 *   2. Gemini gera embedding da descrição
 *   3. Busca no Supabase: 1 film + 1 book + 1 music + 1 place (maior similaridade)
 *   4. Segunda chamada ao Groq: título do pack + frase de conexão por item
 *   5. Se save=true e o usuário estiver logado, persiste na tabela bubble_packs
 */
export async function POST(req: NextRequest) {
  try {
    const { mood, save } = await req.json();
    if (!mood || typeof mood !== "string") {
      return NextResponse.json({ error: "mood required" }, { status: 400 });
    }

    // 1. Gera vibe description usando o prompt de mood
    const vibeDescription = await generateVibeDescription(mood, "mood");

    // 2. Embedding
    const embedding = await embedText(vibeDescription);

    // 3. Busca 1 item de cada tipo no catálogo
    const results = await Promise.all(
      PACK_TYPES.map((type) =>
        supabaseAdmin.rpc("match_catalog_items", {
          query_embedding: embedding,
          match_count: 1,
          filter_type: type,
        })
      )
    );

    const items: any[] = [];
    for (let i = 0; i < PACK_TYPES.length; i++) {
      if (results[i].error) throw results[i].error;
      if (results[i].data?.[0]) items.push(results[i].data[0]);
    }

    if (items.length === 0) {
      return NextResponse.json({ error: "Nenhum item encontrado no catálogo" }, { status: 404 });
    }

    // 4. Groq gera título do pack + frase de conexão para cada item
    const packMeta = await generatePackMeta(mood, items);

    const packItems = items.map((m, i) => ({
      id: m.id,
      title: m.title,
      creator: m.creator,
      type: m.type,
      coverUrl: m.cover_url ?? null,
      connectionPhrase: packMeta.connections[i] ?? "",
      similarityScore: m.similarity,
    }));

    const pack = {
      title: packMeta.title,
      mood,
      vibeDescription,
      items: packItems,
    };

    // 5. Salva se solicitado e se o usuário estiver logado
    let savedId: string | null = null;
    if (save) {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabaseAdmin
          .from("bubble_packs")
          .insert({
            user_id: user.id,
            title: packMeta.title,
            mood_input: mood,
            items: packItems,
          })
          .select("id")
          .single();
        if (error) throw error;
        savedId = data?.id ?? null;
      }
    }

    return NextResponse.json({ ...pack, savedId });
  } catch (e: any) {
    console.error("Pack error:", e);
    return NextResponse.json({ error: e.message ?? "internal error" }, { status: 500 });
  }
}
