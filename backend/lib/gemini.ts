import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";

// Suporta múltiplas keys separadas por vírgula em GEMINI_API_KEY.
// Se uma key falhar com 429 (quota) ou 400 (key inválida), tenta a próxima.
const keys = (process.env.GEMINI_API_KEY ?? "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);

if (keys.length === 0) {
  console.warn("GEMINI_API_KEY não definida — embedText vai falhar.");
}

// Cria um embedder por key (instância leve, só inicializa na primeira chamada real).
const embedders: GenerativeModel[] = keys.map((key) =>
  new GoogleGenerativeAI(key).getGenerativeModel({ model: "models/gemini-embedding-001" })
);

let currentKeyIndex = 0;

/**
 * Recebe um texto qualquer e devolve seu embedding (array de 768 floats).
 * Usado tanto no seed (para indexar o catálogo) quanto na busca em runtime.
 *
 * Se a key atual falhar com quota/invalida, roda pelas demais antes de desistir.
 */
export async function embedText(text: string): Promise<number[]> {
  if (embedders.length === 0) {
    throw new Error("Nenhuma GEMINI_API_KEY configurada");
  }

  let lastError: any;
  for (let attempt = 0; attempt < embedders.length; attempt++) {
    const idx = (currentKeyIndex + attempt) % embedders.length;
    try {
      const result = await embedders[idx].embedContent({
        content: { role: "user", parts: [{ text }] },
        outputDimensionality: 768,
      } as any);
      // Sucesso — fixa nessa key para próximas chamadas
      currentKeyIndex = idx;
      return result.embedding.values;
    } catch (e: any) {
      lastError = e;
      const status = e.status ?? e.httpStatusCode ?? 0;
      const msg = String(e.message ?? "");
      // 429 (quota) ou 400 (key inválida) → tenta próxima key
      if (status === 429 || status === 400 || msg.includes("429") || msg.includes("API_KEY_INVALID")) {
        console.warn(`Gemini key #${idx + 1} falhou (${status || msg.slice(0, 60)}), tentando próxima...`);
        continue;
      }
      // Outros erros (5xx, rede) — não é problema de key, propaga direto
      throw e;
    }
  }
  // Todas as keys falharam
  throw lastError;
}
