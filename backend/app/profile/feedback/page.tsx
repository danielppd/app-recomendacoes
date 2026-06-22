import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  film: "FILME",
  book: "LIVRO",
  music: "MUSICA",
  place: "LUGAR",
};

type FeedbackItem = {
  id: string;
  feedback: string;
  query_context: string | null;
  created_at: string;
  catalog_items: {
    id: string;
    title: string;
    creator: string;
    type: string;
    cover_url: string | null;
    genres: string[] | null;
  } | null;
};

export default async function FeedbackPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: rawFeedbacks } = await supabaseAdmin
    .from("user_feedback")
    .select("id, feedback, query_context, created_at, catalog_items(id, title, creator, type, cover_url, genres)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const items = (rawFeedbacks ?? []).map((f: any) => ({
    ...f,
    catalog_items: Array.isArray(f.catalog_items) ? f.catalog_items[0] ?? null : f.catalog_items,
  })) as FeedbackItem[];
  const liked = items.filter((f) => f.feedback === "liked");
  const disliked = items.filter((f) => f.feedback === "disliked");

  function renderCard(item: FeedbackItem) {
    const ci = item.catalog_items;
    if (!ci) return null;
    return (
      <div
        key={item.id}
        className="bg-neutral-900/60 border border-neutral-800 rounded-xl overflow-hidden"
      >
        <div className="relative aspect-[2/3] w-full bg-neutral-800">
          {ci.cover_url ? (
            <Image
              src={ci.cover_url}
              alt={ci.title}
              fill
              sizes="(max-width: 768px) 50vw, 200px"
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-neutral-800 via-neutral-900 to-black">
              <span className="text-4xl font-light text-neutral-600">
                {ci.title.charAt(0)}
              </span>
            </div>
          )}
        </div>
        <div className="p-3">
          <span className="text-[9px] tracking-[0.2em] text-neutral-500">
            {TYPE_LABEL[ci.type] ?? ci.type.toUpperCase()}
          </span>
          <h3 className="text-sm font-medium leading-tight mt-0.5 truncate">{ci.title}</h3>
          <p className="text-xs text-neutral-400 truncate">{ci.creator}</p>
          {item.query_context && (
            <p className="text-[10px] text-neutral-600 mt-1 truncate">
              via: {item.query_context}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen px-6 py-16 max-w-5xl mx-auto">
      <header className="flex items-center justify-between mb-12">
        <div>
          <h1 className="text-4xl font-light">feedback</h1>
          <p className="text-neutral-500 text-sm mt-1">
            {items.length} {items.length === 1 ? "avaliacao" : "avaliacoes"}
          </p>
        </div>
        <Link href="/profile" className="text-sm text-neutral-400 hover:text-white">
          voltar
        </Link>
      </header>

      {items.length === 0 && (
        <p className="text-neutral-500 text-center mt-20">
          Nenhuma avaliacao ainda. Busque algo e avalie as recomendacoes.
        </p>
      )}

      {liked.length > 0 && (
        <section className="mb-12">
          <h2 className="text-xs tracking-[0.2em] text-neutral-500 mb-4">
            GOSTEI ({liked.length})
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {liked.map(renderCard)}
          </div>
        </section>
      )}

      {disliked.length > 0 && (
        <section>
          <h2 className="text-xs tracking-[0.2em] text-neutral-500 mb-4">
            NAO CURTI ({disliked.length})
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {disliked.map(renderCard)}
          </div>
        </section>
      )}
    </main>
  );
}
