/**
 * Expand-music: popula catalog_items com artistas e álbuns do Spotify.
 *
 * Usa Client Credentials flow (sem OAuth de usuário) — só precisa de
 * SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET. Descobre artistas por gênero via
 * /search?q=genre:"<g>" e busca top álbuns via /artists/{id}/albums. Cada
 * item recebe vibe via Groq + embedding Gemini, igual ao expand-catalog.ts.
 *
 * Ambos artistas e álbuns entram com type="music" (esquema limita tipos a
 * film/book/music/event); o subtype fica em metadata.subtype.
 *
 * Idempotente: pula external_ids já no banco. Retomável: cada item é commitado
 * imediatamente. Target ajusta pelo que já existe.
 *
 * Uso: npm run expand:music [-- --limit=N]
 */
import "dotenv/config";
import { supabaseAdmin } from "../lib/supabase";
import { generateCatalogVibe } from "../lib/groq";
import { embedText } from "../lib/gemini";

// ============================================================================
// Config
// ============================================================================

const SPOTIFY_ACCOUNTS = "https://accounts.spotify.com";
const SPOTIFY_API = "https://api.spotify.com/v1";

// 10 generos x 15 artistas = 150 artistas. Com 2-3 albuns cada = ~350 albuns.
// Total ~500 — bate com o target.
const GENRES = [
  "rock", "pop", "jazz", "electronic", "hip-hop",
  "classical", "indie", "folk", "metal", "soul",
];
const ARTISTS_PER_GENRE = 15;
const ALBUMS_PER_ARTIST = 3;
const TOTAL_TARGET = 500;

// Rate limits
const GROQ_MIN_INTERVAL_MS = 2200;   // ~27 req/min, margem sobre o free tier (30)
const GEMINI_MIN_INTERVAL_MS = 200;
const SPOTIFY_MIN_INTERVAL_MS = 350; // ~170 req/min, bem dentro do generoso limite
const MAX_RETRIES = 5;

// ============================================================================
// Utilidades
// ============================================================================

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const lastCall: Record<string, number> = {};

async function throttle(svc: string, minMs: number) {
  const now = Date.now();
  const elapsed = now - (lastCall[svc] ?? 0);
  if (elapsed < minMs) await sleep(minMs - elapsed);
  lastCall[svc] = Date.now();
}

async function withRetry<T>(fn: () => Promise<T>, label: string, max = MAX_RETRIES): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < max; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const msg = String(e.message ?? "");
      // 4xx permanente (400/403/404) não se resolve com retry — falhou no request.
      // 401 é renovação de token (handled internamente) e 429 é rate-limit — ambos valem retry.
      if (/\b(400|403|404)\b/.test(msg)) throw e;
      const wait = Math.min(60_000, 1000 * Math.pow(2, i));
      console.warn(`  ⚠ ${label} falhou (${msg.slice(0, 140)}), retry ${i + 1}/${max} em ${wait}ms`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

// ============================================================================
// Spotify Client Credentials
// ============================================================================

let spotifyToken: { token: string; expiresAt: number } | null = null;

async function getSpotifyToken(): Promise<string> {
  if (spotifyToken && Date.now() < spotifyToken.expiresAt) return spotifyToken.token;
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) throw new Error("SPOTIFY_CLIENT_ID/SECRET não definidos");
  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch(`${SPOTIFY_ACCOUNTS}/api/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Spotify token ${res.status}: ${await res.text()}`);
  const json = await res.json();
  spotifyToken = {
    token: json.access_token,
    // -60s de margem pra não pegar token expirando no meio de um batch
    expiresAt: Date.now() + (json.expires_in - 60) * 1000,
  };
  return spotifyToken.token;
}

async function spotifyGet(path: string): Promise<any> {
  return withRetry(async () => {
    await throttle("spotify", SPOTIFY_MIN_INTERVAL_MS);
    const token = await getSpotifyToken();
    const res = await fetch(`${SPOTIFY_API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      // Token expirou prematuramente — força refresh no próximo retry
      spotifyToken = null;
      throw new Error("token 401, renovando");
    }
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("retry-after") ?? "30");
      await sleep(retryAfter * 1000);
      throw new Error(`429 rate-limit, esperei ${retryAfter}s`);
    }
    if (!res.ok) {
      throw new Error(`Spotify ${path}: ${res.status} ${(await res.text()).slice(0, 400)}`);
    }
    return res.json();
  }, `Spotify ${path.slice(0, 40)}`);
}

interface SpotifyArtist {
  id: string;
  name: string;
  genres: string[];
  popularity: number;
  images: { url: string }[];
}

interface SpotifyAlbum {
  id: string;
  name: string;
  release_date: string;
  images: { url: string }[];
  total_tracks: number;
  album_type: string;
}

// Spotify /search com type=artist está cappado em limit=10 (apesar da doc
// oficial dizer 50). Pra ter folga pro dedup + sort-by-popularity + top N,
// paginamos via offset=0 e offset=10.
const SPOTIFY_SEARCH_MAX_LIMIT = 10;

async function discoverArtistsByGenre(genre: string, pages = 2): Promise<SpotifyArtist[]> {
  const buildUrl = (q: string, offset: number) =>
    `/search?q=${encodeURIComponent(q)}&type=artist&limit=${SPOTIFY_SEARCH_MAX_LIMIT}&offset=${offset}`;

  // Tenta operador `genre:` primeiro — mais preciso. Se 400, cai pra keyword.
  const tryQuery = async (q: string): Promise<SpotifyArtist[]> => {
    const all: SpotifyArtist[] = [];
    for (let page = 0; page < pages; page++) {
      const json = await spotifyGet(buildUrl(q, page * SPOTIFY_SEARCH_MAX_LIMIT));
      const items: SpotifyArtist[] = json.artists?.items ?? [];
      if (items.length === 0) break;
      all.push(...items);
    }
    return all;
  };

  try {
    const items = await tryQuery(`genre:${genre}`);
    if (items.length > 0) return items;
  } catch (e: any) {
    if (!String(e.message ?? "").includes("400")) throw e;
    console.warn(`  ⚠ genre:${genre} retornou 400, tentando keyword-only`);
  }
  return tryQuery(genre);
}

async function getArtistAlbums(artistId: string, limit = 10): Promise<SpotifyAlbum[]> {
  // include_groups=album filtra singles/compilations/appears_on
  const json = await spotifyGet(
    `/artists/${artistId}/albums?include_groups=album&market=US&limit=${limit}`
  );
  return json.items ?? [];
}

// ============================================================================
// Vibe + embedding com rate limit
// ============================================================================

async function generateVibeWithRetry(title: string, creator: string): Promise<string> {
  return withRetry(async () => {
    await throttle("groq", GROQ_MIN_INTERVAL_MS);
    return generateCatalogVibe(title, creator, "music");
  }, `Groq vibe (${title.slice(0, 30)})`);
}

async function embedWithRetry(text: string): Promise<number[]> {
  return withRetry(async () => {
    await throttle("gemini", GEMINI_MIN_INTERVAL_MS);
    return embedText(text);
  }, "Gemini embed");
}

// ============================================================================
// Idempotência: cache dos music já no banco
// ============================================================================

const existing = new Set<string>(); // stores "music:<external_id>"

async function loadExisting() {
  console.log("Carregando items music existentes no Supabase...");
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from("catalog_items")
      .select("external_id")
      .eq("type", "music")
      .not("external_id", "is", null)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) if (row.external_id) existing.add(`music:${row.external_id}`);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  console.log(`  ${existing.size} items music no banco\n`);
}

function alreadyExists(id: string) { return existing.has(`music:${id}`); }
function remember(id: string) { existing.add(`music:${id}`); }

// ============================================================================
// Falhas sistêmicas
// ============================================================================

class SystemicFailureError extends Error {
  constructor(msg: string) {
    super(`Falha sistêmica detectada: ${msg}. Abortando — não vale a pena continuar.`);
  }
}

interface Counter {
  done: number;
  skipped: number;
  failed: number;
  target: number;
  consecutiveFailures: number;
  lastError: string;
}

function registerFailure(c: Counter, err: string) {
  c.failed++;
  const short = err.slice(0, 80);
  if (short === c.lastError) c.consecutiveFailures++;
  else { c.consecutiveFailures = 1; c.lastError = short; }
  if (c.consecutiveFailures >= 5) throw new SystemicFailureError(short);
}
function registerSuccess(c: Counter) { c.consecutiveFailures = 0; c.lastError = ""; c.done++; }

// ============================================================================
// Normalização de popularity (Spotify é 0-100 linear)
// ============================================================================

function normalizeSpotifyPopularity(raw: number): number {
  if (!raw || raw <= 0) return 0;
  return Math.max(0, Math.min(1, raw / 100));
}

// ============================================================================
// Inserção
// ============================================================================

async function insertArtist(a: SpotifyArtist, c: Counter) {
  if (alreadyExists(a.id)) { c.skipped++; return; }
  const idx = c.done + c.failed + 1;
  const tag = `[${idx}/${c.target}]`;
  try {
    const genres = a.genres?.length ? a.genres : ["music"];
    const vibe = await generateVibeWithRetry(a.name, genres.slice(0, 3).join(", "));
    const embedding = await embedWithRetry(vibe);

    const { error } = await supabaseAdmin.from("catalog_items").insert({
      title: a.name,
      creator: a.name,
      type: "music",
      year: null,
      cover_url: a.images[0]?.url ?? null,
      vibe_description: vibe,
      embedding,
      external_id: a.id,
      language: "en",
      rating: null,
      genres,
      popularity_score: normalizeSpotifyPopularity(a.popularity),
      metadata: {
        subtype: "artist",
        spotify_id: a.id,
        popularity: a.popularity,
      },
    });
    if (error) throw error;
    remember(a.id);
    registerSuccess(c);
    console.log(`✓ ${tag} Artista: ${a.name} — pop=${normalizeSpotifyPopularity(a.popularity).toFixed(2)}, genres=${genres.slice(0, 2).join("/")}`);
  } catch (e: any) {
    console.log(`✗ ${tag} Artista: ${a.name} — ${e.message?.slice(0, 100)}`);
    registerFailure(c, e.message ?? "unknown");
  }
}

async function insertAlbum(al: SpotifyAlbum, artistName: string, artistGenres: string[], c: Counter) {
  if (alreadyExists(al.id)) { c.skipped++; return; }
  const idx = c.done + c.failed + 1;
  const tag = `[${idx}/${c.target}]`;
  try {
    const year = al.release_date ? parseInt(al.release_date.slice(0, 4)) : null;
    const vibe = await generateVibeWithRetry(al.name, artistName);
    const embedding = await embedWithRetry(vibe);

    const { error } = await supabaseAdmin.from("catalog_items").insert({
      title: al.name,
      creator: artistName,
      type: "music",
      year,
      cover_url: al.images[0]?.url ?? null,
      vibe_description: vibe,
      embedding,
      external_id: al.id,
      language: "en",
      rating: null,
      genres: artistGenres?.length ? artistGenres : ["music"],
      // /artists/{id}/albums não retorna popularity — deixamos null.
      // Se quiser popularity por álbum, precisa um GET /albums/{id} extra (mais 1 req por item).
      popularity_score: null,
      metadata: {
        subtype: "album",
        spotify_id: al.id,
        artist: artistName,
        total_tracks: al.total_tracks,
        release_date: al.release_date,
      },
    });
    if (error) throw error;
    remember(al.id);
    registerSuccess(c);
    console.log(`✓ ${tag} Álbum: ${al.name} — ${artistName} (${year ?? "?"})`);
  } catch (e: any) {
    console.log(`✗ ${tag} Álbum: ${al.name} — ${e.message?.slice(0, 100)}`);
    registerFailure(c, e.message ?? "unknown");
  }
}

// ============================================================================
// Pipeline
// ============================================================================

async function runPipeline(target: number) {
  const c: Counter = { done: 0, skipped: 0, failed: 0, target, consecutiveFailures: 0, lastError: "" };
  console.log(`=== MUSIC (faltam: ${target}) ===\n`);

  // Fase 1: descoberta — monta map de artistas únicos cross-genre
  console.log("-- Fase 1: descoberta de artistas --");
  const artistMap = new Map<string, SpotifyArtist>();
  for (const genre of GENRES) {
    let items: SpotifyArtist[] = [];
    try {
      items = await discoverArtistsByGenre(genre);
    } catch (e: any) {
      console.warn(`  ⚠ discover ${genre} falhou: ${e.message?.slice(0, 400)}`);
      continue;
    }
    items.sort((a, b) => b.popularity - a.popularity);
    let added = 0;
    for (const a of items) {
      if (added >= ARTISTS_PER_GENRE) break;
      if (!artistMap.has(a.id)) {
        artistMap.set(a.id, a);
        added++;
      }
    }
    console.log(`  ${genre}: +${added} (total único: ${artistMap.size})`);
  }
  console.log(`\n→ ${artistMap.size} artistas únicos descobertos\n`);

  // Fase 2: insere artistas intercalando com seus top álbuns
  console.log("-- Fase 2: inserção (artista + 3 álbuns por vez) --\n");
  outer: for (const artist of artistMap.values()) {
    if (c.done >= c.target) break;

    await insertArtist(artist, c);
    if (c.done >= c.target) break outer;

    let albums: SpotifyAlbum[] = [];
    try {
      albums = await getArtistAlbums(artist.id, 10);
    } catch (e: any) {
      console.warn(`  ⚠ albums de ${artist.name}: ${e.message?.slice(0, 80)}`);
      continue;
    }

    // Dedupe por título normalizado — Spotify retorna várias edições
    // do mesmo álbum (Deluxe, Anniversary, Remastered, etc.)
    const seen = new Set<string>();
    const uniqueAlbums: SpotifyAlbum[] = [];
    for (const al of albums) {
      const key = al.name.toLowerCase().replace(/\s*\(.*?\)\s*/g, "").replace(/\s+-\s+.*/g, "").trim();
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueAlbums.push(al);
      if (uniqueAlbums.length >= ALBUMS_PER_ARTIST) break;
    }

    for (const al of uniqueAlbums) {
      if (c.done >= c.target) break outer;
      await insertAlbum(al, artist.name, artist.genres ?? [], c);
    }
  }

  console.log(`\n→ Música: ${c.done} novos, ${c.skipped} já existiam, ${c.failed} falhas`);
}

// ============================================================================
// Entry
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const rawTarget = limitArg ? parseInt(limitArg.split("=")[1]) : TOTAL_TARGET;

  const missing: string[] = [];
  if (!process.env.SPOTIFY_CLIENT_ID) missing.push("SPOTIFY_CLIENT_ID");
  if (!process.env.SPOTIFY_CLIENT_SECRET) missing.push("SPOTIFY_CLIENT_SECRET");
  if (!process.env.GROQ_API_KEY) missing.push("GROQ_API_KEY");
  if (!process.env.GEMINI_API_KEY) missing.push("GEMINI_API_KEY");
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length) {
    console.error(`Falta env vars: ${missing.join(", ")}`);
    process.exit(1);
  }

  const t0 = Date.now();
  await loadExisting();

  const remaining = Math.max(0, rawTarget - existing.size);
  console.log(`Total alvo: ${rawTarget}, já no banco: ${existing.size}, faltam: ${remaining}`);
  if (remaining === 0) {
    console.log("→ Nada a fazer, target já atingido.");
    return;
  }

  try {
    await runPipeline(remaining);
  } catch (e: any) {
    if (e instanceof SystemicFailureError) {
      console.error(`\n❌ ${e.message}`);
      console.error(`   Verifique: API keys válidas? Cota Groq/Gemini OK?`);
      process.exit(2);
    }
    throw e;
  }

  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`\nConcluído em ${mins} min.`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
