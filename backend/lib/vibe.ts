// Utilitários de vetores para o pipeline de "vibe composta".
import { generateVibeDescription } from "./groq";
import { embedText } from "./gemini";

/**
 * Centroide = média elemento a elemento de uma lista de vetores.
 * É a forma mais simples e eficaz de compor múltiplas vibes em uma só,
 * preservando a localidade no espaço de embeddings.
 */
export function centroid(vectors: number[][]): number[] {
  if (vectors.length === 0) throw new Error("centroid: empty input");
  const dim = vectors[0].length;
  const out = new Array(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) out[i] += v[i];
  }
  for (let i = 0; i < dim; i++) out[i] /= vectors.length;
  return out;
}

/**
 * Média ponderada — útil para incorporar feedback positivo sem descartar
 * o vetor base do usuário. Ex.: 0.7 * base + 0.3 * centroide dos likes.
 */
export function weightedAverage(a: number[], b: number[], wA: number, wB: number): number[] {
  const total = wA + wB;
  return a.map((v, i) => (v * wA + b[i] * wB) / total);
}

/**
 * Dado uma lista de nomes (artistas), gera a descrição de vibe de cada um
 * com Groq, embedda cada uma com Gemini e devolve o centroide.
 */
export async function buildVibeCentroid(names: string[]): Promise<number[]> {
  const vectors: number[][] = [];
  for (const name of names) {
    try {
      const vibe = await generateVibeDescription(name);
      const emb = await embedText(vibe);
      vectors.push(emb);
    } catch (e) {
      console.error(`Falha ao embeddar ${name}:`, e);
    }
  }
  if (vectors.length === 0) throw new Error("Nenhum vetor gerado");
  return centroid(vectors);
}
