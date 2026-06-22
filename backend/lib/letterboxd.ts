/**
 * Parser do RSS público do Letterboxd.
 * Não precisa de API key — dados públicos acessíveis via RSS.
 * O fetch é feito server-side para evitar CORS.
 */
import { XMLParser } from "fast-xml-parser";

export type LetterboxdEntry = {
  title: string;
  rating: number | null; // 0-5 (meio estrelas possíveis: 3.5)
  watchedDate: string | null;
  link: string;
};

/**
 * Busca e parseia o RSS do Letterboxd de um usuário.
 * Retorna os últimos 30 filmes, filtrados por nota >= 3.5
 * (ou sem nota, pois presença no diary indica interesse).
 */
export async function fetchLetterboxdDiary(username: string): Promise<LetterboxdEntry[]> {
  const url = `https://letterboxd.com/${encodeURIComponent(username)}/rss/`;
  const res = await fetch(url, {
    headers: {
      // Letterboxd bloqueia requests sem User-Agent
      "User-Agent": "Bubble/1.0",
    },
  });

  if (!res.ok) {
    if (res.status === 404) throw new Error("Usuário Letterboxd não encontrado");
    throw new Error(`Letterboxd RSS error: ${res.status}`);
  }

  const xml = await res.text();
  const parser = new XMLParser({
    ignoreAttributes: false,
    // Letterboxd usa namespaces customizados (letterboxd:filmTitle, etc.)
    // removeNSPrefix remove o prefixo para simplificar o acesso
    removeNSPrefix: true,
  });

  const parsed = parser.parse(xml);
  const items = parsed?.rss?.channel?.item;
  if (!items) return [];

  // items pode ser um objeto único ou array
  const entries = (Array.isArray(items) ? items : [items]) as any[];

  return entries
    .map((item: any) => ({
      title: item.filmTitle ?? extractTitleFromDesc(item.title),
      rating: item.memberRating ? parseFloat(item.memberRating) : null,
      watchedDate: item.watchedDate ?? null,
      link: item.link ?? "",
    }))
    // Filtra: nota >= 3.5 ou sem nota (presença no diary já indica interesse)
    .filter((e) => e.rating === null || e.rating >= 3.5)
    .slice(0, 30);
}

/** Fallback: extrai título do campo <title> que tem formato "Film Title, Year" */
function extractTitleFromDesc(title: string): string {
  if (!title) return "";
  // Remove o ano entre vírgulas no final se existir
  return title.replace(/,\s*\d{4}\s*$/, "").trim();
}

/** Valida se o RSS existe (username correto). */
export async function validateLetterboxdUser(username: string): Promise<boolean> {
  try {
    const entries = await fetchLetterboxdDiary(username);
    return true;
  } catch {
    return false;
  }
}
