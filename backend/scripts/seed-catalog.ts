/**
 * Seed do catálogo. Para cada item:
 *   1. Gera vibe_description com Groq
 *   2. Gera embedding com Gemini
 *   3. Insere no Supabase
 * Aguarda 500ms entre chamadas para respeitar rate limits gratuitos.
 *
 * Uso:  npm run seed
 */
import "dotenv/config";
import { generateCatalogVibe } from "../lib/groq";
import { embedText } from "../lib/gemini";
import { supabaseAdmin } from "../lib/supabase";

type SeedItem = {
  title: string;
  creator: string;
  type: "film" | "book";
  year?: number;
};

const FILMS: SeedItem[] = [
  { title: "Her", creator: "Spike Jonze", type: "film", year: 2013 },
  { title: "Blade Runner 2049", creator: "Denis Villeneuve", type: "film", year: 2017 },
  { title: "Lost in Translation", creator: "Sofia Coppola", type: "film", year: 2003 },
  { title: "Drive", creator: "Nicolas Winding Refn", type: "film", year: 2011 },
  { title: "Eternal Sunshine of the Spotless Mind", creator: "Michel Gondry", type: "film", year: 2004 },
  { title: "Mulholland Drive", creator: "David Lynch", type: "film", year: 2001 },
  { title: "Moon", creator: "Duncan Jones", type: "film", year: 2009 },
  { title: "Annihilation", creator: "Alex Garland", type: "film", year: 2018 },
  { title: "Under the Skin", creator: "Jonathan Glazer", type: "film", year: 2013 },
  { title: "Coherence", creator: "James Ward Byrkit", type: "film", year: 2013 },
  { title: "Ex Machina", creator: "Alex Garland", type: "film", year: 2014 },
  { title: "A Ghost Story", creator: "David Lowery", type: "film", year: 2017 },
  { title: "The Double", creator: "Richard Ayoade", type: "film", year: 2013 },
  { title: "Enemy", creator: "Denis Villeneuve", type: "film", year: 2013 },
  { title: "Synecdoche, New York", creator: "Charlie Kaufman", type: "film", year: 2008 },
  { title: "Melancholia", creator: "Lars von Trier", type: "film", year: 2011 },
  { title: "Burning", creator: "Lee Chang-dong", type: "film", year: 2018 },
  { title: "Parasite", creator: "Bong Joon-ho", type: "film", year: 2019 },
  { title: "Portrait of a Lady on Fire", creator: "Céline Sciamma", type: "film", year: 2019 },
  { title: "Past Lives", creator: "Celine Song", type: "film", year: 2023 },
];

const BOOKS: SeedItem[] = [
  { title: "Norwegian Wood", creator: "Haruki Murakami", type: "book" },
  { title: "O Apanhador no Campo de Centeio", creator: "J.D. Salinger", type: "book" },
  { title: "1984", creator: "George Orwell", type: "book" },
  { title: "Admirável Mundo Novo", creator: "Aldous Huxley", type: "book" },
  { title: "Siddhartha", creator: "Hermann Hesse", type: "book" },
  { title: "O Estrangeiro", creator: "Albert Camus", type: "book" },
  { title: "Cem Anos de Solidão", creator: "Gabriel García Márquez", type: "book" },
  { title: "O Lobo da Estepe", creator: "Hermann Hesse", type: "book" },
  { title: "Bartleby, o Escrivão", creator: "Herman Melville", type: "book" },
  { title: "A Insustentável Leveza do Ser", creator: "Milan Kundera", type: "book" },
  { title: "Geek Love", creator: "Katherine Dunn", type: "book" },
  { title: "Slaughterhouse-Five", creator: "Kurt Vonnegut", type: "book" },
  { title: "Never Let Me Go", creator: "Kazuo Ishiguro", type: "book" },
  { title: "The Bell Jar", creator: "Sylvia Plath", type: "book" },
  { title: "Ham on Rye", creator: "Charles Bukowski", type: "book" },
  { title: "Convenience Store Woman", creator: "Sayaka Murata", type: "book" },
  { title: "Kafka on the Shore", creator: "Haruki Murakami", type: "book" },
  { title: "Piranesi", creator: "Susanna Clarke", type: "book" },
  { title: "The Remains of the Day", creator: "Kazuo Ishiguro", type: "book" },
  { title: "A Little Life", creator: "Hanya Yanagihara", type: "book" },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function seed() {
  const items = [...FILMS, ...BOOKS];
  console.log(`Seeding ${items.length} items...`);

  for (const item of items) {
    try {
      // Evita duplicar se rodar o seed mais de uma vez
      const { data: existing } = await supabaseAdmin
        .from("catalog_items")
        .select("id")
        .eq("title", item.title)
        .eq("creator", item.creator)
        .maybeSingle();
      if (existing) {
        console.log(`⏭  ${item.title} (já existe)`);
        continue;
      }

      const vibe = await generateCatalogVibe(item.title, item.creator, item.type);
      await sleep(500);
      const embedding = await embedText(vibe);
      await sleep(500);

      const { error } = await supabaseAdmin.from("catalog_items").insert({
        title: item.title,
        creator: item.creator,
        type: item.type,
        year: item.year ?? null,
        vibe_description: vibe,
        embedding,
      });
      if (error) throw error;
      console.log(`✅ ${item.title}`);
    } catch (e) {
      console.error(`❌ ${item.title}:`, e);
    }
  }
  console.log("Done.");
}

seed();
