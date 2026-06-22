import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import Papa from "papaparse";

export const runtime = "nodejs";

/**
 * POST /api/goodreads — importa biblioteca do Goodreads via CSV.
 * Body: FormData com campo "file" (o CSV exportado).
 *
 * Pipeline:
 *   1. Parseia CSV com PapaParse (server-side)
 *   2. Filtra: shelf = "read" AND (rating >= 4 OR rating = 0)
 *   3. Para cada livro: busca no catalog_items por ILIKE no título
 *   4. Insere em user_book_imports
 *   5. Se encontrou matches, mescla embeddings ao perfil (peso 25%)
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  try {
    // Verifica se já importou na última semana
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabaseAdmin
      .from("user_book_imports")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("imported_at", oneWeekAgo);

    if (count && count > 0) {
      return NextResponse.json(
        { error: "Você já importou livros esta semana. Tente novamente mais tarde." },
        { status: 429 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "CSV file required" }, { status: 400 });
    }

    const csvText = await file.text();
    const { data: rows, errors } = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
    });

    if (errors.length > 0 && rows.length === 0) {
      return NextResponse.json({ error: "CSV inválido" }, { status: 400 });
    }

    // Filtra livros lidos com nota >= 4 (ou sem nota, pois muitos não avaliam)
    const filtered = (rows as any[]).filter((row) => {
      const shelf = (row["Exclusive Shelf"] ?? "").trim().toLowerCase();
      const rating = parseInt(row["My Rating"] ?? "0", 10);
      return shelf === "read" && (rating >= 4 || rating === 0);
    });

    let imported = 0;
    let matched = 0;
    const matchedEmbeddings: number[][] = [];

    for (const row of filtered) {
      const title = (row["Title"] ?? "").trim();
      const author = (row["Author"] ?? "").trim();
      const rating = parseInt(row["My Rating"] ?? "0", 10);

      if (!title) continue;

      // Busca no catálogo
      const { data: items } = await supabaseAdmin
        .from("catalog_items")
        .select("id, embedding")
        .eq("type", "book")
        .ilike("title", `%${title}%`)
        .limit(1);

      const match = items?.[0] ?? null;
      const catalogItemId = match?.id ?? null;
      if (match?.embedding) {
        matched++;
        const emb = Array.isArray(match.embedding)
          ? match.embedding
          : JSON.parse(match.embedding);
        matchedEmbeddings.push(emb);
      }

      // Insere na tabela de imports (mesmo sem match no catálogo)
      await supabaseAdmin.from("user_book_imports").insert({
        user_id: user.id,
        title,
        author: author || null,
        rating: rating || null,
        source: "goodreads",
        catalog_item_id: catalogItemId,
      });

      imported++;
    }

    // Mescla embeddings dos matches ao perfil (peso 25%)
    if (matchedEmbeddings.length > 0) {
      const dim = matchedEmbeddings[0].length;
      const centroid = new Array(dim).fill(0);
      for (const emb of matchedEmbeddings) {
        for (let i = 0; i < dim; i++) centroid[i] += emb[i];
      }
      for (let i = 0; i < dim; i++) centroid[i] /= matchedEmbeddings.length;

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
        // 75% existente + 25% Goodreads
        finalVibe = existing.map((v: number, i: number) =>
          (v * 0.75 + centroid[i] * 0.25)
        );
      }

      await supabase
        .from("profiles")
        .update({ vibe_embedding: finalVibe, updated_at: new Date().toISOString() })
        .eq("id", user.id);
    }

    return NextResponse.json({
      imported,
      matched,
      total: filtered.length,
    });
  } catch (e: any) {
    console.error("Goodreads import error:", e);
    return NextResponse.json({ error: e.message ?? "Failed to import" }, { status: 500 });
  }
}
