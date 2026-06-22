/**
 * Expand-catalog (v2 — API-driven discovery)
 *
 * Expande o catalogo de ~300 para ~2500 itens usando:
 *   - TMDB /discover/movie: 10 generos x 7 decadas, top por vote_average, vote_count>=500
 *   - Google Books volumes: 10 categorias, ordenadas por relevance
 *
 * Para cada item:
 *   1. Gera vibe_description via Groq (rate-limited ~27 req/min)
 *   2. Gera embedding 768-dim via Gemini
 *   3. Insere em catalog_items com popularity_score (0-1, log-normalizado)
 *
 * Idempotente: pula itens cujo (type, external_id) ja esta na tabela.
 * Retomavel: cada item e commitado imediatamente; ao reiniciar, continua do ponto.
 *
 * Uso: npm run expand [-- --films-only | --books-only | --limit=N]
 */
import "dotenv/config";
import { supabaseAdmin } from "../lib/supabase";
import { generateCatalogVibe } from "../lib/groq";
import { embedText } from "../lib/gemini";

// ============================================================================
// Configuracao
// ============================================================================

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";
const GOOGLE_BOOKS_BASE = "https://www.googleapis.com/books/v1/volumes";

// TMDB: 10 generos x ~7 decadas pra chegar em 1500 filmes
const FILM_GENRES: Array<{ id: number; name: string }> = [
  { id: 18, name: "Drama" },
  { id: 878, name: "Science Fiction" },
  { id: 53, name: "Thriller" },
  { id: 10749, name: "Romance" },
  { id: 35, name: "Comedy" },
  { id: 27, name: "Horror" },
  { id: 99, name: "Documentary" },
  { id: 16, name: "Animation" },
  { id: 80, name: "Crime" },
  { id: 9648, name: "Mystery" },
];

// Decadas para diversidade temporal. Cada (genero, decada) pesca ~22 filmes = ~1540 total
const FILM_DECADES: Array<{ from: number; to: number; label: string }> = [
  { from: 1960, to: 1969, label: "60s" },
  { from: 1970, to: 1979, label: "70s" },
  { from: 1980, to: 1989, label: "80s" },
  { from: 1990, to: 1999, label: "90s" },
  { from: 2000, to: 2009, label: "00s" },
  { from: 2010, to: 2019, label: "10s" },
  { from: 2020, to: 2029, label: "20s" },
];
const FILMS_PER_CELL = 22;   // por (genero x decada)
const FILM_MIN_VOTE_COUNT = 500;
const FILM_TARGET = 1500;

// Google Books: 10 categorias x ~100 livros = 1000
const BOOK_CATEGORIES = [
  "fiction",
  "literary fiction",
  "science fiction",
  "philosophy",
  "poetry",
  "thriller",
  "romance",
  "fantasy",
  "nonfiction",
  "biography",
];
const BOOKS_PER_CATEGORY = 100;
const BOOK_TARGET = 1000;

// Rate limiting do Groq: free tier ~30 req/min. Mantemos margem de ~10%.
const GROQ_MIN_INTERVAL_MS = 2200;   // 60000/27 ≈ 2222ms
const GEMINI_MIN_INTERVAL_MS = 200;  // Gemini tem quota bem maior
const MAX_RETRIES = 5;

// ============================================================================
// Utilidades
// ============================================================================

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Estado de rate limit: timestamp da ultima chamada por servico
const lastCall: Record<string, number> = { groq: 0, gemini: 0, tmdb: 0, books: 0 };

/**
 * Throttle: garante que chamadas de um servico ficam espacadas por pelo menos
 * `minMs`. Se a ultima foi ha menos, dorme o necessario.
 */
async function throttle(service: string, minMs: number) {
  const now = Date.now();
  const elapsed = now - (lastCall[service] ?? 0);
  if (elapsed < minMs) await sleep(minMs - elapsed);
  lastCall[service] = Date.now();
}

/**
 * Executa fn com retry exponencial. Serve para qualquer chamada que possa
 * falhar transitoriamente (429, 5xx, network error).
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxAttempts = MAX_RETRIES
): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const wait = Math.min(60_000, 1000 * Math.pow(2, i));
      console.warn(`  ⚠ ${label} falhou (${e.message?.slice(0, 80)}), retry ${i + 1}/${maxAttempts} em ${wait}ms`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

/**
 * Normaliza popularity bruto para 0-1 via log10. Curva log e' mais util que
 * linear porque popularidade tem distribuicao cauda-pesada.
 *   popularity ~0:     score ~0
 *   popularity 100:    score ~0.67
 *   popularity 1000:   score ~1.0  (capped)
 */
function normalizePopularity(raw: number, pivot = 1000): number {
  if (!raw || raw <= 0) return 0;
  const score = Math.log10(raw + 1) / Math.log10(pivot + 1);
  return Math.max(0, Math.min(1, score));
}

// ============================================================================
// TMDB: discover
// ============================================================================

interface TmdbRaw {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  genre_ids: number[];
  release_date: string;
  popularity: number;
  vote_average: number;
  vote_count: number;
  original_language: string;
}

let tmdbGenreMap: Record<number, string> | null = null;

async function loadTmdbGenres(): Promise<Record<number, string>> {
  if (tmdbGenreMap) return tmdbGenreMap;
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error("TMDB_API_KEY nao definido");
  const url = `${TMDB_BASE}/genre/movie/list?api_key=${key}&language=pt-BR`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB genres ${res.status}`);
  const json = await res.json();
  tmdbGenreMap = {};
  for (const g of json.genres ?? []) tmdbGenreMap[g.id] = g.name;
  return tmdbGenreMap;
}

/**
 * Busca filmes via /discover/movie com filtros ricos. Retorna 20 resultados por pagina.
 * Usado para coletar top N filmes por genero x decada.
 */
async function discoverMovies(opts: {
  genreId: number;
  yearFrom?: number;
  yearTo?: number;
  page?: number;
}): Promise<TmdbRaw[]> {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error("TMDB_API_KEY nao definido");
  const params = new URLSearchParams({
    api_key: key,
    language: "pt-BR",
    sort_by: "vote_average.desc",
    "vote_count.gte": String(FILM_MIN_VOTE_COUNT),
    with_genres: String(opts.genreId),
    page: String(opts.page ?? 1),
    include_adult: "false",
  });
  if (opts.yearFrom) params.set("primary_release_date.gte", `${opts.yearFrom}-01-01`);
  if (opts.yearTo) params.set("primary_release_date.lte", `${opts.yearTo}-12-31`);

  return withRetry(async () => {
    await throttle("tmdb", 250); // TMDB permite 40 req / 10s, damos margem
    const res = await fetch(`${TMDB_BASE}/discover/movie?${params}`);
    if (!res.ok) throw new Error(`TMDB discover ${res.status}: ${await res.text()}`);
    const json = await res.json();
    return json.results ?? [];
  }, "TMDB discover");
}

// ============================================================================
// Google Books: discover por categoria
// ============================================================================

interface BookRaw {
  googleBooksId: string;
  title: string;
  authors: string[];
  description: string;
  coverUrl: string | null;
  categories: string[];
  publishedDate: string;
  averageRating: number | null;
  ratingsCount: number;
  language: string;
}

const googleBooksKeys = (process.env.GOOGLE_BOOKS_API_KEY ?? "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);
const googleBooksBurned = new Set<string>();

function pickBookCover(imageLinks: any): string | null {
  if (!imageLinks) return null;
  const raw: string | undefined =
    imageLinks.medium ?? imageLinks.thumbnail ?? imageLinks.smallThumbnail;
  if (!raw) return null;
  return raw.replace(/^http:/, "https:").replace(/zoom=1/, "zoom=2");
}

/**
 * Busca volumes via subject:<categoria>. Retorna ate maxResults (40 max no API)
 * a partir de startIndex. Rotaciona chaves; se todas falharem, cai pra sem chave.
 */
async function discoverBooks(
  category: string,
  startIndex: number,
  maxResults = 40
): Promise<BookRaw[]> {
  const query = `subject:"${category}"`;
  return withRetry(async () => {
    await throttle("books", 200);
    const activeKey = googleBooksKeys.find((k) => !googleBooksBurned.has(k)) ?? null;
    const url =
      `${GOOGLE_BOOKS_BASE}?q=${encodeURIComponent(query)}` +
      `&orderBy=relevance` +
      `&startIndex=${startIndex}` +
      `&maxResults=${maxResults}` +
      `&printType=books` +
      (activeKey ? `&key=${activeKey}` : "");
    const res = await fetch(url);
    if (!res.ok) {
      // 400/403 = key invalida/revogada; 429 = quota diaria estourada — em todos os casos,
      // queima a key atual pra proxima tentativa pegar outra (ou cair no modo sem key).
      if (activeKey && (res.status === 400 || res.status === 403 || res.status === 429)) {
        googleBooksBurned.add(activeKey);
        const remaining = googleBooksKeys.filter((k) => !googleBooksBurned.has(k)).length;
        console.warn(`  ⚠ Google Books key queimada (${res.status}), ${remaining} restantes`);
      }
      throw new Error(`Google Books ${res.status}: ${(await res.text()).slice(0, 120)}`);
    }
    const json = await res.json();
    const items = json.items ?? [];
    return items.map((it: any): BookRaw => {
      const v = it.volumeInfo ?? {};
      return {
        googleBooksId: it.id,
        title: v.title ?? "",
        authors: v.authors ?? [],
        description: v.description ?? "",
        coverUrl: pickBookCover(v.imageLinks),
        categories: v.categories ?? [category],
        publishedDate: v.publishedDate ?? "",
        averageRating: v.averageRating ?? null,
        ratingsCount: v.ratingsCount ?? 0,
        language: v.language ?? "en",
      };
    });
  }, `Google Books (${category} @${startIndex})`);
}

// ============================================================================
// Geracao de vibe + embedding (com rate limit)
// ============================================================================

async function generateVibeWithRetry(title: string, creator: string, type: string): Promise<string> {
  return withRetry(async () => {
    await throttle("groq", GROQ_MIN_INTERVAL_MS);
    return generateCatalogVibe(title, creator, type);
  }, `Groq vibe (${title.slice(0, 30)})`);
}

async function embedWithRetry(text: string): Promise<number[]> {
  return withRetry(async () => {
    await throttle("gemini", GEMINI_MIN_INTERVAL_MS);
    return embedText(text);
  }, "Gemini embed");
}

// ============================================================================
// Idempotencia: cache de itens existentes
// ============================================================================

const existingExternalIds = new Set<string>(); // "film:123" / "book:abc"

async function loadExistingItems() {
  console.log("Carregando itens existentes do Supabase...");
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from("catalog_items")
      .select("type, external_id")
      .not("external_id", "is", null)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (row.external_id) existingExternalIds.add(`${row.type}:${row.external_id}`);
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  console.log(`  ${existingExternalIds.size} itens com external_id no banco\n`);
}

function alreadyExists(type: string, externalId: string): boolean {
  return existingExternalIds.has(`${type}:${externalId}`);
}
function remember(type: string, externalId: string) {
  existingExternalIds.add(`${type}:${externalId}`);
}

// ============================================================================
// Insercao de filme
// ============================================================================

interface ProcessCounter {
  done: number;
  skipped: number;
  failed: number;
  target: number;
  consecutiveFailures: number;
  lastError: string;
}

/**
 * Detecta falhas sistemicas: se o mesmo erro aparece em 5 itens seguidos,
 * aborta (provavelmente migration nao aplicada, API key invalida, etc.)
 */
class SystemicFailureError extends Error {
  constructor(msg: string) {
    super(`Falha sistemica detectada: ${msg}. Abortando — nao vale a pena continuar.`);
  }
}

function registerFailure(ctr: ProcessCounter, err: string) {
  ctr.failed++;
  const short = err.slice(0, 80);
  if (short === ctr.lastError) {
    ctr.consecutiveFailures++;
  } else {
    ctr.consecutiveFailures = 1;
    ctr.lastError = short;
  }
  if (ctr.consecutiveFailures >= 5) {
    throw new SystemicFailureError(short);
  }
}
function registerSuccess(ctr: ProcessCounter) {
  ctr.consecutiveFailures = 0;
  ctr.lastError = "";
  ctr.done++;
}

async function processFilm(raw: TmdbRaw, ctr: ProcessCounter) {
  const tmdbId = String(raw.id);
  if (alreadyExists("film", tmdbId)) {
    ctr.skipped++;
    return;
  }
  const idx = ctr.done + ctr.skipped + ctr.failed + 1;
  const tag = `[${idx}/${ctr.target}]`;
  try {
    const genreMap = await loadTmdbGenres();
    const genres = (raw.genre_ids ?? []).map((id) => genreMap[id]).filter(Boolean);
    const year = raw.release_date ? parseInt(raw.release_date.slice(0, 4)) : null;
    const basis = raw.overview || `${raw.title} (${genres.join(", ")})`;

    const vibe = await generateVibeWithRetry(raw.title, genres[0] ?? "Film", "film");
    const embedding = await embedWithRetry(vibe);

    const { error } = await supabaseAdmin.from("catalog_items").insert({
      title: raw.title,
      creator: genres[0] ?? "Film",
      type: "film",
      year,
      cover_url: raw.poster_path ? `${TMDB_IMG}${raw.poster_path}` : null,
      vibe_description: vibe,
      embedding,
      external_id: tmdbId,
      language: raw.original_language ?? "en",
      rating: raw.vote_average || null,
      genres,
      popularity_score: normalizePopularity(raw.popularity, 1000),
      metadata: {
        overview: raw.overview,
        vote_count: raw.vote_count,
        tmdb_popularity: raw.popularity,
      },
    });
    if (error) throw error;
    remember("film", tmdbId);
    registerSuccess(ctr);
    console.log(
      `✓ ${tag} Filme: ${raw.title} (${year ?? "?"}) — pop=${normalizePopularity(raw.popularity).toFixed(2)}, vote=${raw.vote_average}`
    );
  } catch (e: any) {
    console.log(`✗ ${tag} Filme: ${raw.title} — ${e.message?.slice(0, 100)}`);
    registerFailure(ctr, e.message ?? "unknown");
  }
}

async function processBook(raw: BookRaw, ctr: ProcessCounter) {
  if (!raw.googleBooksId || !raw.title) return;
  if (alreadyExists("book", raw.googleBooksId)) {
    ctr.skipped++;
    return;
  }
  const idx = ctr.done + ctr.skipped + ctr.failed + 1;
  const tag = `[${idx}/${ctr.target}]`;
  try {
    const year = raw.publishedDate ? parseInt(raw.publishedDate.slice(0, 4)) : null;
    const creatorStr = raw.authors[0] ?? "";
    const basis = raw.description || raw.categories.join(", ") || raw.title;

    const vibe = await generateVibeWithRetry(raw.title, `${raw.authors.join(", ")}. ${basis}`, "book");
    const embedding = await embedWithRetry(vibe);

    const { error } = await supabaseAdmin.from("catalog_items").insert({
      title: raw.title,
      creator: creatorStr,
      type: "book",
      year,
      cover_url: raw.coverUrl,
      vibe_description: vibe,
      embedding,
      external_id: raw.googleBooksId,
      language: raw.language,
      rating: raw.averageRating,
      genres: raw.categories,
      popularity_score: normalizePopularity(raw.ratingsCount, 10000),
      metadata: {
        description: raw.description,
        ratings_count: raw.ratingsCount,
        published_date: raw.publishedDate,
      },
    });
    if (error) throw error;
    remember("book", raw.googleBooksId);
    registerSuccess(ctr);
    console.log(
      `✓ ${tag} Livro: ${raw.title} — pop=${normalizePopularity(raw.ratingsCount, 10000).toFixed(2)}, ratings=${raw.ratingsCount}`
    );
  } catch (e: any) {
    console.log(`✗ ${tag} Livro: ${raw.title} — ${e.message?.slice(0, 100)}`);
    registerFailure(ctr, e.message ?? "unknown");
  }
}

// ============================================================================
// Pipelines
// ============================================================================

async function runFilmsPipeline(limit?: number) {
  const baseTarget = limit ?? FILM_TARGET;
  const existingFilms = [...existingExternalIds].filter((k) => k.startsWith("film:")).length;
  const remaining = Math.max(0, baseTarget - existingFilms);
  const ctr: ProcessCounter = { done: 0, skipped: 0, failed: 0, target: remaining, consecutiveFailures: 0, lastError: "" };
  console.log(`\n=== FILMES (total alvo: ${baseTarget}, já no banco: ${existingFilms}, faltam: ${remaining}) ===`);
  if (remaining === 0) {
    console.log("→ Nada a fazer, target já atingido.");
    return;
  }
  await loadTmdbGenres();

  outer: for (const genre of FILM_GENRES) {
    for (const decade of FILM_DECADES) {
      console.log(`\n-- ${genre.name} / ${decade.label} --`);
      // Coleta candidatos paginando ate ter >=FILMS_PER_CELL unicos nao-existentes
      const candidates: TmdbRaw[] = [];
      for (let page = 1; page <= 5 && candidates.length < FILMS_PER_CELL * 2; page++) {
        let results: TmdbRaw[] = [];
        try {
          results = await discoverMovies({
            genreId: genre.id,
            yearFrom: decade.from,
            yearTo: decade.to,
            page,
          });
        } catch (e: any) {
          console.warn(`  ⚠ pagina ${page} falhou: ${e.message?.slice(0, 80)}`);
          break;
        }
        if (results.length === 0) break;
        candidates.push(...results);
      }
      // Pega os top FILMS_PER_CELL nao-existentes
      const fresh = candidates
        .filter((r) => !alreadyExists("film", String(r.id)))
        .slice(0, FILMS_PER_CELL);
      for (const raw of fresh) {
        await processFilm(raw, ctr);
        if (ctr.done >= ctr.target) break outer;
      }
    }
  }
  console.log(`\n→ Filmes: ${ctr.done} novos, ${ctr.skipped} ja existiam, ${ctr.failed} falhas`);
}

async function runBooksPipeline(limit?: number) {
  const baseTarget = limit ?? BOOK_TARGET;
  const existingBooks = [...existingExternalIds].filter((k) => k.startsWith("book:")).length;
  const remaining = Math.max(0, baseTarget - existingBooks);
  const ctr: ProcessCounter = { done: 0, skipped: 0, failed: 0, target: remaining, consecutiveFailures: 0, lastError: "" };
  console.log(`\n=== LIVROS (total alvo: ${baseTarget}, já no banco: ${existingBooks}, faltam: ${remaining}) ===`);
  if (remaining === 0) {
    console.log("→ Nada a fazer, target já atingido.");
    return;
  }

  outer: for (const category of BOOK_CATEGORIES) {
    console.log(`\n-- ${category} --`);
    // Google Books: paginamos ate BOOKS_PER_CATEGORY novos (40 por pagina max)
    let fresh = 0;
    for (let startIndex = 0; startIndex < 400 && fresh < BOOKS_PER_CATEGORY; startIndex += 40) {
      let results: BookRaw[] = [];
      try {
        results = await discoverBooks(category, startIndex, 40);
      } catch (e: any) {
        console.warn(`  ⚠ startIndex=${startIndex} falhou: ${e.message?.slice(0, 80)}`);
        break;
      }
      if (results.length === 0) break;
      const unique = results.filter((r) => !alreadyExists("book", r.googleBooksId));
      for (const raw of unique) {
        if (fresh >= BOOKS_PER_CATEGORY) break;
        await processBook(raw, ctr);
        fresh++;
        if (ctr.done >= ctr.target) break outer;
      }
    }
  }
  console.log(`\n→ Livros: ${ctr.done} novos, ${ctr.skipped} ja existiam, ${ctr.failed} falhas`);
}

// ============================================================================
// Entry point
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const filmsOnly = args.includes("--films-only");
  const booksOnly = args.includes("--books-only");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1]) : undefined;

  const missing: string[] = [];
  if (!process.env.TMDB_API_KEY) missing.push("TMDB_API_KEY");
  if (!process.env.GROQ_API_KEY) missing.push("GROQ_API_KEY");
  if (!process.env.GEMINI_API_KEY) missing.push("GEMINI_API_KEY");
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length) {
    console.error(`Falta env vars: ${missing.join(", ")}`);
    process.exit(1);
  }

  const t0 = Date.now();
  await loadExistingItems();

  try {
    if (!booksOnly) await runFilmsPipeline(filmsOnly ? limit : undefined);
    if (!filmsOnly) await runBooksPipeline(booksOnly ? limit : undefined);
  } catch (e: any) {
    if (e instanceof SystemicFailureError) {
      console.error(`\n❌ ${e.message}`);
      console.error(`   Verifique: migration aplicada? API keys validas? Cota/quota OK?`);
      process.exit(2);
    }
    throw e;
  }

  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`\nConcluido em ${mins} min.`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
