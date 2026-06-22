import Groq from "groq-sdk";

// Cliente Groq compartilhado. Lê a chave de GROQ_API_KEY no ambiente.
export const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Modelo gratuito e rápido — bom o suficiente para gerar parágrafos curtos de "vibe".
const MODEL = "llama-3.1-8b-instant";

// Prompts especializados por tipo de busca. O prompt "artist" é o original;
// os demais serão usados pela Tarefa 2 (busca multi-tipo).
const VIBE_PROMPTS: Record<string, (input: string) => string> = {
  artist: (input) =>
    `Descreva a vibe estética, emocional e cultural do artista ou banda '${input}' em 4 linhas. Inclua obrigatoriamente: atmosfera geral, referências visuais e de época, emoções específicas evocadas, textura e ritmo. Seja específico — evite descrições genéricas como 'melancólico' sem contexto. Responda apenas o parágrafo.`,
  film: (input) =>
    `Descreva a atmosfera, tom emocional e experiência estética do filme '${input}' em 4 linhas. Inclua: paleta visual dominante, ritmo narrativo, sensação ao assistir, referências culturais e de época. Seja específico. Responda apenas o parágrafo.`,
  book: (input) =>
    `Descreva a vibe, ritmo de leitura e atmosfera do livro '${input}' em 4 linhas. Inclua: densidade emocional, estilo narrativo, sensação ao ler, universo cultural evocado. Seja específico. Responda apenas o parágrafo.`,
  mood: (input) =>
    `Traduza esse mood ou momento em características estéticas e emocionais detalhadas: '${input}'. Pense em: temperatura emocional, ritmo, referências sensoriais, contexto de lugar e hora. 4 linhas. Responda apenas o parágrafo.`,
};

/**
 * Gera um parágrafo descrevendo a vibe estética/emocional de um subject.
 * searchType seleciona o prompt especializado (artist | film | book | mood).
 * contextPrefix é injetado antes do prompt principal (clima, humor, etc.)
 * para calibrar o tom sem alterar a instrução core.
 */
export async function generateVibeDescription(
  subject: string,
  searchType: string = "artist",
  contextPrefix: string = ""
): Promise<string> {
  const buildPrompt = VIBE_PROMPTS[searchType] ?? VIBE_PROMPTS.artist;
  const fullPrompt = contextPrefix
    ? `${contextPrefix}\n${buildPrompt(subject)}`
    : buildPrompt(subject);
  const res = await groq.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: fullPrompt }],
    temperature: 0.7,
  });
  return res.choices[0]?.message?.content?.trim() ?? "";
}

/**
 * Variante do prompt para itens do catálogo (filmes, livros, músicas).
 * O texto retornado é o que será embeddado e indexado no Supabase.
 */
export async function generateCatalogVibe(
  title: string,
  creator: string,
  type: string
): Promise<string> {
  const prompt = `Descreva a vibe estética, emocional e temática do ${type} "${title}" de ${creator} em um parágrafo de 3-4 linhas. Foque em: atmosfera, emoções dominantes, referências culturais e estética visual. Responda apenas o parágrafo, sem títulos.`;
  const res = await groq.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
  });
  return res.choices[0]?.message?.content?.trim() ?? "";
}

/**
 * Gera uma frase curta (1 linha) explicando por que um item recomendado
 * conecta-se ao artista buscado. Ex.: "mesma melancolia urbana de Frank Ocean".
 */
export async function generateConnectionPhrase(
  artist: string,
  itemTitle: string,
  itemType: string
): Promise<string> {
  const prompt = `Em uma única frase curta e poética (máximo 12 palavras, em português), explique a conexão estética entre o artista "${artist}" e o ${itemType} "${itemTitle}". Comece com palavras como "mesma", "a mesma", "aquele", etc. Responda apenas a frase, sem aspas.`;
  const res = await groq.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.8,
  });
  return res.choices[0]?.message?.content?.trim().replace(/^"|"$/g, "") ?? "";
}

/**
 * Gera frases de conexão para múltiplos itens em uma única chamada LLM.
 * Reduz latência de N chamadas individuais para 1 chamada com JSON mode.
 * Fallback: se o JSON vier malformado, retorna frases genéricas.
 */
export async function generateConnectionPhrasesBatch(
  subject: string,
  items: Array<{ title: string; type: string }>
): Promise<string[]> {
  const itemList = items
    .map((it, i) => `${i + 1}. ${TYPE_LABEL_PT[it.type] ?? it.type}: "${it.title}"`)
    .join("\n");

  const prompt = `Para cada item abaixo, escreva UMA frase curta e poética (máximo 12 palavras, em português) explicando a conexão estética com "${subject}". Comece cada frase com palavras como "mesma", "a mesma", "aquele", etc.

${itemList}

Responda em JSON válido: { "phrases": ["frase1", "frase2", ...] }
Exatamente ${items.length} frases, na mesma ordem. Apenas o JSON, sem markdown.`;

  const res = await groq.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.8,
    response_format: { type: "json_object" },
  });

  const raw = res.choices[0]?.message?.content?.trim() ?? "{}";
  try {
    const parsed = JSON.parse(raw);
    const phrases = Array.isArray(parsed.phrases) ? parsed.phrases : [];
    // Garante que temos exatamente o número certo de frases
    return items.map((_, i) =>
      (typeof phrases[i] === "string" ? phrases[i] : "").replace(/^"|"$/g, "")
    );
  } catch {
    return items.map(() => "");
  }
}

const TYPE_LABEL_PT: Record<string, string> = {
  film: "filme",
  book: "livro",
  music: "música",
  place: "lugar",
};

/**
 * Segunda chamada ao Groq para o Bubble Pack.
 * Recebe o mood original + os itens selecionados e retorna:
 *   - title: nome criativo para o pack (3-5 palavras)
 *   - connections: frase de conexão para cada item
 *
 * Usa JSON mode para garantir parsing confiável. O prompt pede um objeto
 * com exatamente essas chaves, evitando regex frágil.
 */
export async function generatePackMeta(
  mood: string,
  items: Array<{ title: string; type: string; creator: string }>
): Promise<{ title: string; connections: string[] }> {
  const itemList = items
    .map((it, i) => `${i + 1}. ${TYPE_LABEL_PT[it.type] ?? it.type}: "${it.title}" de ${it.creator}`)
    .join("\n");

  const prompt = `Dado o mood "${mood}" e estes itens selecionados:
${itemList}

Responda em JSON válido com:
- "title": um nome criativo e evocativo para este pack (3 a 5 palavras em português, sem aspas extras)
- "connections": um array com uma frase curta (máx 15 palavras) para cada item, explicando por que ele combina com o mood. Na mesma ordem dos itens.

Responda APENAS o JSON, sem markdown.`;

  const res = await groq.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.8,
    response_format: { type: "json_object" },
  });

  const raw = res.choices[0]?.message?.content?.trim() ?? "{}";
  try {
    const parsed = JSON.parse(raw);
    return {
      title: parsed.title ?? "Sem título",
      connections: Array.isArray(parsed.connections) ? parsed.connections : [],
    };
  } catch {
    // Fallback se o JSON vier malformado
    return { title: "Pack sem título", connections: items.map(() => "") };
  }
}
