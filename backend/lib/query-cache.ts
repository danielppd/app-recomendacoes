import { supabaseAdmin } from "@/lib/supabase";

type CacheRow = {
  vibe_description: string | null;
  embedding: number[] | null;
  hit_count: number;
};

export async function getCachedVibe(queryInput: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("query_cache")
    .select("vibe_description, hit_count")
    .eq("query_type", "vibe_description")
    .eq("query_input", queryInput)
    .single();

  if (error || !data?.vibe_description) return null;

  // Incrementa hit_count em background
  supabaseAdmin
    .from("query_cache")
    .update({ hit_count: (data.hit_count ?? 0) + 1 })
    .eq("query_type", "vibe_description")
    .eq("query_input", queryInput)
    .then(() => {});

  return data.vibe_description;
}

export async function setCachedVibe(queryInput: string, vibeDescription: string): Promise<void> {
  await supabaseAdmin
    .from("query_cache")
    .upsert(
      {
        query_type: "vibe_description",
        query_input: queryInput,
        vibe_description: vibeDescription,
        hit_count: 0,
      },
      { onConflict: "query_type,query_input" }
    );
}

export async function getCachedEmbedding(queryInput: string): Promise<number[] | null> {
  const { data, error } = await supabaseAdmin
    .from("query_cache")
    .select("embedding, hit_count")
    .eq("query_type", "embedding")
    .eq("query_input", queryInput)
    .single();

  if (error || !data?.embedding) return null;

  // Incrementa hit_count em background
  supabaseAdmin
    .from("query_cache")
    .update({ hit_count: (data.hit_count ?? 0) + 1 })
    .eq("query_type", "embedding")
    .eq("query_input", queryInput)
    .then(() => {});

  const emb = data.embedding;
  return Array.isArray(emb) ? emb : JSON.parse(emb as any);
}

export async function setCachedEmbedding(queryInput: string, embedding: number[]): Promise<void> {
  await supabaseAdmin
    .from("query_cache")
    .upsert(
      {
        query_type: "embedding",
        query_input: queryInput,
        embedding,
        hit_count: 0,
      },
      { onConflict: "query_type,query_input" }
    );
}
