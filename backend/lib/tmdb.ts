/**
 * Cliente da TMDB API v3.
 * Docs: https://developer.themoviedb.org/reference/search-movie
 *
 * Estratégia: tenta em pt-BR primeiro; se o overview vier vazio, refaz em
 * en-US. Isso acontece muito com filmes pouco conhecidos no Brasil.
 */

export interface MovieResult {
  tmdbId: number;
  title: string;
  overview: string;
  coverUrl: string | null;
  genres: string[];
  releaseDate: string;
  voteAverage: number;
  originalLanguage: string;
}

const BASE = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p/w500";

// Cache dos gêneros (id -> name) porque a search/movie só devolve genre_ids.
// Buscamos a tabela uma única vez por execução.
let genreMap: Record<number, string> | null = null;

async function loadGenres(language: string): Promise<Record<number, string>> {
  if (genreMap) return genreMap;
  const key = process.env.TMDB_API_KEY;
  const url = `${BASE}/genre/movie/list?api_key=${key}&language=${language}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB genres ${res.status}`);
  const json = await res.json();
  genreMap = {};
  for (const g of json.genres ?? []) genreMap[g.id] = g.name;
  return genreMap;
}

/**
 * Faz uma busca em TMDB. Se `year` for passado, restringe ao ano
 * para desambiguar remakes (ex: Suspiria 1977 vs 2018).
 */
async function searchRaw(title: string, language: string, year?: number): Promise<any | null> {
  const key = process.env.TMDB_API_KEY;
  const url =
    `${BASE}/search/movie?api_key=${key}` +
    `&query=${encodeURIComponent(title)}` +
    `&language=${language}` +
    (year ? `&primary_release_year=${year}` : "");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB search ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.results?.[0] ?? null;
}

/**
 * Busca um filme por título (e opcionalmente ano).
 * Retorna null se não encontrar.
 */
export async function searchMovie(title: string, year?: number): Promise<MovieResult | null> {
  let raw = await searchRaw(title, "pt-BR", year);
  // Fallback: overview vazio em pt-BR → refaz em en-US
  if (raw && !raw.overview) {
    const en = await searchRaw(title, "en-US", year);
    if (en) raw = { ...raw, overview: en.overview };
  }
  if (!raw) return null;

  const map = await loadGenres("pt-BR");
  const genres = (raw.genre_ids ?? []).map((id: number) => map[id]).filter(Boolean);

  return {
    tmdbId: raw.id,
    title: raw.title ?? title,
    overview: raw.overview ?? "",
    coverUrl: raw.poster_path ? `${IMG}${raw.poster_path}` : null,
    genres,
    releaseDate: raw.release_date ?? "",
    voteAverage: raw.vote_average ?? 0,
    originalLanguage: raw.original_language ?? "en",
  };
}
