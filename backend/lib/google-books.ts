/**
 * Cliente da Google Books API.
 * Docs: https://developers.google.com/books/docs/v1/using
 *
 * Estratégia: busca por intitle + inauthor primeiro; se não achar, relaxa para
 * só intitle. Retorna o primeiro resultado (que é o mais relevante segundo o
 * ranking do Google).
 */

export interface BookResult {
  googleBooksId: string;
  title: string;
  authors: string[];
  description: string;
  coverUrl: string | null;
  categories: string[];
  publishedDate: string;
  averageRating: number | null;
  language: string;
}

const BASE = "https://www.googleapis.com/books/v1/volumes";

/**
 * Rotação de chaves: aceita uma OU várias chaves separadas por vírgula em
 * GOOGLE_BOOKS_API_KEY (ex.: "key1,key2,key3"). Quando uma chave falha com
 * 400/403 (inválida ou quota estourada), ela é marcada como queimada e a
 * próxima é usada. Se todas falharem, cai para chamada SEM chave — a Books
 * API funciona sem autenticação (quota menor, ~100 req/min por IP, suficiente
 * para seed ocasional).
 */
const keys = (process.env.GOOGLE_BOOKS_API_KEY ?? "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);
const burned = new Set<string>();

function nextKey(): string | null {
  for (const k of keys) if (!burned.has(k)) return k;
  return null;
}

async function tryFetch(query: string, key: string | null): Promise<Response> {
  const url =
    `${BASE}?q=${encodeURIComponent(query)}&maxResults=5&printType=books` +
    (key ? `&key=${key}` : "");
  return fetch(url);
}

/**
 * Faz uma chamada à API e devolve o primeiro volume encontrado, ou null.
 * Tenta cada chave disponível; se todas falharem, tenta sem chave.
 */
async function fetchFirst(query: string): Promise<any | null> {
  const attempts: (string | null)[] = [];
  let k = nextKey();
  while (k) {
    attempts.push(k);
    k = keys.find((x) => !burned.has(x) && !attempts.includes(x)) ?? null;
  }
  attempts.push(null); // fallback sem chave

  let lastErr = "";
  for (const key of attempts) {
    // Retry com backoff exponencial para erros transientes (5xx / 429)
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await tryFetch(query, key);
      if (res.ok) {
        const json = await res.json();
        return json.items?.[0] ?? null;
      }
      lastErr = `${res.status}: ${await res.text()}`;
      // 400 (key inválida) / 403 (quota) → queima a chave e tenta a próxima
      if (key && (res.status === 400 || res.status === 403)) {
        burned.add(key);
        console.warn(`⚠ Google Books key queimada (${res.status}), tentando próxima...`);
        break; // sai do retry e passa pra próxima chave
      }
      // Transientes: 429 (rate limit), 500, 502, 503, 504 → backoff
      if ([429, 500, 502, 503, 504].includes(res.status)) {
        const wait = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s, 8s
        console.warn(`⚠ Google Books ${res.status}, retry em ${wait}ms...`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      // Erro desconhecido: propaga
      throw new Error(`Google Books ${lastErr}`);
    }
  }
  throw new Error(`Google Books falhou após retries. Último: ${lastErr}`);
}

/**
 * Escolhe a melhor capa disponível (medium > thumbnail > smallThumbnail)
 * e força zoom=2 para ter resolução decente. A API devolve zoom=1 por padrão,
 * o que fica pixelado.
 */
function pickCover(imageLinks: any): string | null {
  if (!imageLinks) return null;
  const raw: string | undefined =
    imageLinks.medium ?? imageLinks.thumbnail ?? imageLinks.smallThumbnail;
  if (!raw) return null;
  // http -> https e zoom=1 -> zoom=2
  return raw.replace(/^http:/, "https:").replace(/zoom=1/, "zoom=2");
}

/**
 * Busca um livro por título (e opcionalmente autor).
 * Retorna null se nada for encontrado.
 */
export async function searchBook(
  title: string,
  author?: string
): Promise<BookResult | null> {
  // 1ª tentativa: título + autor
  let item: any = null;
  if (author) {
    item = await fetchFirst(`intitle:${title}+inauthor:${author}`);
  }
  // 2ª tentativa: só título
  if (!item) item = await fetchFirst(`intitle:${title}`);
  if (!item) return null;

  const v = item.volumeInfo ?? {};
  return {
    googleBooksId: item.id,
    title: v.title ?? title,
    authors: v.authors ?? (author ? [author] : []),
    description: v.description ?? "",
    coverUrl: pickCover(v.imageLinks),
    categories: v.categories ?? [],
    publishedDate: v.publishedDate ?? "",
    averageRating: v.averageRating ?? null,
    language: v.language ?? "en",
  };
}
