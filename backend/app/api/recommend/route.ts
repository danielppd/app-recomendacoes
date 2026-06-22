import { NextRequest, NextResponse } from "next/server";
import { generateVibeDescription, generateConnectionPhrasesBatch } from "@/lib/groq";
import { embedText } from "@/lib/gemini";
import { supabaseAdmin } from "@/lib/supabase";
import { createClient } from "@/lib/supabase-server";
import { weightedAverage } from "@/lib/vibe";
import { getCachedVibe, setCachedVibe, getCachedEmbedding, setCachedEmbedding } from "@/lib/query-cache";

export const runtime = "nodejs";

const CATALOG_TYPES = ["film", "book", "music", "place"] as const;
const DEFAULT_LIMIT = 8;
const DEFAULT_PER_TYPE: Record<string, number> = {
  film: 2,
  book: 2,
  music: 2,
  place: 2,
};
// Threshold minimo de similaridade — itens abaixo sao descartados (melhor 5 bons que 8 com 3 irrelevantes)
const MIN_SIMILARITY = parseFloat(process.env.MIN_SIMILARITY ?? "0.65");
// Multiplicador de buffer: buscamos N*MULT por tipo pra ter folga apos filtros (disliked, threshold, dedupe)
const OVERFETCH_MULT = 3;

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: Record<string, any>) {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      }

      try {
        const t0 = performance.now();
        const { artist, searchType, weather, mood, excludeIds } = await req.json();
        // excludeIds = IDs ja mostrados nesta sessao (dedupe soft: filtra mas cai de volta se ficar sem pool)
        const sessionExclude: Set<string> = new Set(Array.isArray(excludeIds) ? excludeIds : []);
        if (!artist || typeof artist !== "string") {
          send({ type: "error", error: "artist required" });
          controller.close();
          return;
        }

        let contextPrefix = "";
        if (weather && weather.city) {
          contextPrefix += `Contexto situacional: ${weather.period} em ${weather.city}, ${weather.description}, ${weather.temp}°C. Considere esse contexto para calibrar sutilmente o tom e a atmosfera das recomendações.\n`;
        }
        if (mood) {
          contextPrefix += `${mood}\n`;
        }

        const cacheKey = `${searchType ?? "all"}:${artist}:${contextPrefix}`.trim();

        // --- Vibe description ---
        const tVibe = performance.now();
        let vibeDescription = await getCachedVibe(cacheKey);
        let vibeCached = !!vibeDescription;
        if (!vibeDescription) {
          vibeDescription = await generateVibeDescription(artist, searchType, contextPrefix);
          setCachedVibe(cacheKey, vibeDescription);
        }
        const vibeMs = Math.round(performance.now() - tVibe);
        console.log(`[PERF] Vibe description: ${vibeMs}ms (cached: ${vibeCached})`);

        // Envia vibe imediatamente para o frontend
        send({ type: "vibe", vibeDescription });

        // --- Embedding ---
        const tEmbed = performance.now();
        let embedding = await getCachedEmbedding(cacheKey);
        let embedCached = !!embedding;
        if (!embedding) {
          embedding = await embedText(vibeDescription);
          setCachedEmbedding(cacheKey, embedding);
        }
        const embedMs = Math.round(performance.now() - tEmbed);
        console.log(`[PERF] Gemini embedding: ${embedMs}ms (cached: ${embedCached})`);

        // --- Auth + user vector mix ---
        const tAuth = performance.now();
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        const authMs = Math.round(performance.now() - tAuth);
        console.log(`[PERF] Auth check: ${authMs}ms`);

        // Disliked items do usuario (hard exclude) — busca em paralelo ao mix de vetor
        let dislikedIds: Set<string> = new Set();
        if (user) {
          const [_prof, dislikes] = await Promise.all([
            supabase
              .from("profiles")
              .select("vibe_embedding")
              .eq("id", user.id)
              .single()
              .then(({ data: prof }) => {
                const userVec = prof?.vibe_embedding
                  ? (Array.isArray(prof.vibe_embedding) ? prof.vibe_embedding : JSON.parse(prof.vibe_embedding))
                  : null;
                if (userVec && Array.isArray(userVec) && userVec.length === embedding!.length) {
                  embedding = weightedAverage(embedding!, userVec, 0.6, 0.4);
                }
                return null;
              }),
            supabaseAdmin
              .from("user_feedback")
              .select("item_id")
              .eq("user_id", user.id)
              .eq("feedback", "disliked"),
          ]);
          dislikedIds = new Set((dislikes.data ?? []).map((d: any) => d.item_id));
          console.log(`[filters] disliked items to exclude: ${dislikedIds.size}`);
        }

        const totalLimit = parseInt(process.env.RECOMMEND_LIMIT ?? "") || DEFAULT_LIMIT;
        const showScores = process.env.SHOW_SCORES === "true";

        const scale = totalLimit / DEFAULT_LIMIT;
        const perType: Record<string, number> = {};
        for (const t of CATALOG_TYPES) {
          perType[t] = Math.max(1, Math.round(DEFAULT_PER_TYPE[t] * scale));
        }

        // --- pgvector search (com buffer OVERFETCH_MULT pra filtros terem folga) ---
        const tSearch = performance.now();
        const results = await Promise.all(
          CATALOG_TYPES.map((type) =>
            supabaseAdmin.rpc("match_catalog_items", {
              query_embedding: embedding,
              match_count: perType[type] * OVERFETCH_MULT,
              filter_type: type,
            })
          )
        );
        const searchMs = Math.round(performance.now() - tSearch);
        console.log(`[PERF] pgvector search (4 types parallel): ${searchMs}ms`);

        // Monta pool por tipo, aplicando filtros hard: disliked + threshold.
        // Session exclude e guardado separado — e soft (so aplica se tiver folga).
        const pool: Record<string, any[]> = {};
        const softExcluded: Record<string, any[]> = {};
        for (let i = 0; i < CATALOG_TYPES.length; i++) {
          if (results[i].error) throw results[i].error;
          const t = CATALOG_TYPES[i];
          const raw = results[i].data ?? [];
          const primary: any[] = [];
          const backup: any[] = [];
          for (const it of raw) {
            if (dislikedIds.has(it.id)) continue;              // hard exclude: disliked
            if ((it.similarity ?? 0) < MIN_SIMILARITY) continue; // hard exclude: threshold
            if (sessionExclude.has(it.id)) {
              backup.push(it);                                  // soft exclude: sessao
            } else {
              primary.push(it);
            }
          }
          pool[t] = primary;
          softExcluded[t] = backup;
        }

        // Selecao por tipo: pega perType[t] do primary; se faltar, complementa do softExcluded
        let selected: any[] = [];
        let deficit = 0;
        for (const type of CATALOG_TYPES) {
          const take = pool[type].slice(0, perType[type]);
          const short = perType[type] - take.length;
          if (short > 0) {
            take.push(...softExcluded[type].slice(0, short));
          }
          selected.push(...take);
          deficit += perType[type] - take.length;
        }

        // Preenche deficit com itens extras de qualquer tipo (ja filtrados threshold+disliked)
        if (deficit > 0) {
          const usedIds = new Set(selected.map((s) => s.id));
          const fallbackPool = [
            ...CATALOG_TYPES.flatMap((t) => pool[t]),
            ...CATALOG_TYPES.flatMap((t) => softExcluded[t]),
          ]
            .filter((item) => !usedIds.has(item.id))
            .sort((a, b) => b.similarity - a.similarity);
          selected.push(...fallbackPool.slice(0, deficit));
        }

        selected.sort((a, b) => b.similarity - a.similarity);
        selected = selected.slice(0, totalLimit);

        // Diversidade: garantir >= 2 categorias no top N. Se so tem 1, troca o
        // pior item pelo melhor item de outra categoria disponivel.
        const typesPresent = new Set(selected.map((s) => s.type));
        if (typesPresent.size < 2 && selected.length >= 2) {
          const currentType = selected[0].type;
          const usedIds = new Set(selected.map((s) => s.id));
          const otherTypeBest = CATALOG_TYPES
            .filter((t) => t !== currentType)
            .flatMap((t) => [...pool[t], ...softExcluded[t]])
            .filter((it) => !usedIds.has(it.id))
            .sort((a, b) => b.similarity - a.similarity)[0];
          if (otherTypeBest) {
            selected[selected.length - 1] = otherTypeBest;
            selected.sort((a, b) => b.similarity - a.similarity);
            console.log(`[filters] diversity: substituido pior item por ${otherTypeBest.type}`);
          }
        }

        const typeCounts = selected.reduce((acc: Record<string, number>, s) => {
          acc[s.type] = (acc[s.type] ?? 0) + 1;
          return acc;
        }, {});
        console.log(`[filters] threshold=${MIN_SIMILARITY}, session_excluded=${sessionExclude.size}, final=${selected.length}, types=${JSON.stringify(typeCounts)}`);

        // Envia cards (sem connection phrases) imediatamente
        const cards = selected.map((m: any) => ({
          id: m.id,
          title: m.title,
          creator: m.creator,
          type: m.type,
          coverUrl: m.cover_url ?? null,
          connectionPhrase: "",
          similarityScore: m.similarity,
          genres: m.genres ?? [],
          externalId: m.external_id ?? null,
          language: m.language ?? null,
          rating: m.rating ?? null,
        }));

        send({ type: "cards", recommendations: cards, showScores });

        // --- Connection phrases (etapa mais lenta depois do cache) ---
        const tPhrases = performance.now();
        const connectionPhrases = await generateConnectionPhrasesBatch(
          artist,
          selected.map((m: any) => ({ title: m.title, type: m.type }))
        );
        const phrasesMs = Math.round(performance.now() - tPhrases);
        console.log(`[PERF] Connection phrases batch (Groq): ${phrasesMs}ms`);

        // Envia as frases como update — o frontend aplica sobre os cards
        const phraseMap: Record<string, string> = {};
        selected.forEach((m: any, i: number) => {
          phraseMap[m.id] = connectionPhrases[i] ?? "";
        });
        send({ type: "phrases", phrases: phraseMap });

        const totalMs = Math.round(performance.now() - t0);
        console.log(`[PERF] === TOTAL: ${totalMs}ms === (vibe: ${vibeMs}, embed: ${embedMs}, auth: ${authMs}, search: ${searchMs}, phrases: ${phrasesMs})`);

        send({
          type: "done",
          _perf: { vibeMs, embedMs, authMs, searchMs, phrasesMs, totalMs, vibeCached, embedCached },
        });

        controller.close();
      } catch (e: any) {
        console.error(e);
        send({ type: "error", error: e.message ?? "internal error" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      "Transfer-Encoding": "chunked",
    },
  });
}
