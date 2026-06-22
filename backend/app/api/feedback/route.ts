// POST /api/feedback { itemId, itemType, feedback, queryContext? }
//   feedback: "liked" | "disliked"
//   itemType: "film" | "book" | "music" | "place"
// - Faz upsert na tabela user_feedback
// - Se liked, também insere em saved_items (histórico)
// - A cada 5 likes, recalcula vibe_embedding do profile
//
// GET /api/feedback?itemIds=id1,id2,...
// - Retorna feedback existente do usuário logado para os itens listados
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import { centroid, weightedAverage } from "@/lib/vibe";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ feedbacks: {} });

  const raw = req.nextUrl.searchParams.get("itemIds") ?? "";
  const itemIds = raw.split(",").filter(Boolean);
  if (itemIds.length === 0) return NextResponse.json({ feedbacks: {} });

  console.log("[feedback GET] user:", user.id, "checking", itemIds.length, "items");

  const { data, error } = await supabaseAdmin
    .from("user_feedback")
    .select("item_id, feedback")
    .eq("user_id", user.id)
    .in("item_id", itemIds);

  if (error) {
    console.error("[feedback GET] error:", error.message);
    return NextResponse.json({ feedbacks: {} });
  }

  const feedbacks: Record<string, string> = {};
  for (const row of data ?? []) {
    feedbacks[row.item_id] = row.feedback;
  }

  console.log("[feedback GET] found", Object.keys(feedbacks).length, "existing feedbacks");
  return NextResponse.json({ feedbacks });
}

export async function POST(req: NextRequest) {
  const { itemId, itemType, feedback, queryContext } = await req.json();
  if (!itemId || !["liked", "disliked"].includes(feedback)) {
    return NextResponse.json({ error: "bad input" }, { status: 400 });
  }

  console.log("[feedback POST] itemId:", itemId, "feedback:", feedback, "itemType:", itemType);

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.log("[feedback POST] user not authenticated");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  console.log("[feedback POST] user:", user.id);

  // Upsert feedback
  const { error: upsertErr } = await supabaseAdmin
    .from("user_feedback")
    .upsert(
      {
        user_id: user.id,
        item_id: itemId,
        item_type: itemType ?? null,
        feedback,
        query_context: queryContext ?? null,
      },
      { onConflict: "user_id,item_id" }
    );

  if (upsertErr) {
    console.error("[feedback POST] upsert error:", upsertErr.message);
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  console.log("[feedback POST] upsert OK");

  // Histórico só com likes
  if (feedback === "liked") {
    const { error: saveErr } = await supabaseAdmin
      .from("saved_items")
      .upsert(
        { user_id: user.id, item_id: itemId },
        { onConflict: "user_id,item_id" }
      );
    if (saveErr) console.error("[feedback POST] saved_items error:", saveErr.message);
    else console.log("[feedback POST] saved to saved_items");
  }

  // A cada 5 likes, recalcula o vetor do usuário
  const { count } = await supabaseAdmin
    .from("user_feedback")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("feedback", "liked");

  console.log("[feedback POST] total likes:", count);

  if (count && count > 0 && count % 5 === 0) {
    console.log("[feedback POST] recalculating vibe_embedding...");

    const { data: likes } = await supabaseAdmin
      .from("user_feedback")
      .select("item_id")
      .eq("user_id", user.id)
      .eq("feedback", "liked")
      .order("created_at", { ascending: false })
      .limit(20);

    const ids = (likes ?? []).map((l) => l.item_id);
    if (ids.length > 0) {
      const { data: items } = await supabaseAdmin
        .from("catalog_items")
        .select("embedding")
        .in("id", ids);

      const vecs = (items ?? [])
        .map((i: any) => (Array.isArray(i.embedding) ? i.embedding : JSON.parse(i.embedding)))
        .filter((v: any) => Array.isArray(v) && v.length === 768);

      if (vecs.length > 0) {
        const likeCentroid = centroid(vecs);

        const { data: prof } = await supabaseAdmin
          .from("profiles")
          .select("vibe_embedding")
          .eq("id", user.id)
          .single();

        const base = prof?.vibe_embedding
          ? (Array.isArray(prof.vibe_embedding)
              ? prof.vibe_embedding
              : JSON.parse(prof.vibe_embedding))
          : null;

        const merged = base ? weightedAverage(base, likeCentroid, 0.7, 0.3) : likeCentroid;

        await supabaseAdmin
          .from("profiles")
          .update({ vibe_embedding: merged, updated_at: new Date().toISOString() })
          .eq("id", user.id);

        console.log("[feedback POST] vibe_embedding updated");
      }
    }
  }

  return NextResponse.json({ ok: true });
}
