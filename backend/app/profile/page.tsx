// Página "Sua Bolha": mostra top artistas do Spotify, tags de vibe e histórico.
// Protegida pelo middleware — usuários não-autenticados são redirecionados.
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import { getTopArtists } from "@/lib/lastfm";
import LogoutButton from "@/components/LogoutButton";
import LastfmConnect from "@/components/LastfmConnect";
import LetterboxdConnect from "@/components/LetterboxdConnect";
import GoodreadsImport from "@/components/GoodreadsImport";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null; // middleware já redireciona; só satisfaz o TS

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, email, top_artists, vibe_tags, spotify_id, lastfm_username, letterboxd_username, letterboxd_data")
    .eq("id", user.id)
    .single();

  // Últimos 10 itens salvos (feedback positivo ou visualizações)
  const { data: history } = await supabase
    .from("saved_items")
    .select("id, created_at, catalog_items(title, creator, type, cover_url)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  // Busca dados das integrações em paralelo
  const [lastfmArtists, goodreadsImports] = await Promise.all([
    // Last.fm: busca top artistas se conectado (server-side, com API key)
    profile?.lastfm_username
      ? getTopArtists(profile.lastfm_username, 5).catch(() => [])
      : Promise.resolve([]),
    // Goodreads: conta livros importados
    supabaseAdmin
      .from("user_book_imports")
      .select("id, title, author, rating", { count: "exact" })
      .eq("user_id", user.id)
      .order("rating", { ascending: false, nullsFirst: false })
      .limit(10)
      .then(({ data, count }) => ({ items: data ?? [], count: count ?? 0 })),
  ]);

  // Letterboxd: usa dados cacheados no perfil
  const letterboxdFilms = (profile?.letterboxd_data ?? []) as Array<{
    title: string;
    year?: string;
    rating?: number;
    link?: string;
  }>;

  const topArtists = (profile?.top_artists ?? []) as Array<{
    id: string;
    name: string;
    image: string | null;
    genres: string[];
  }>;

  return (
    <main className="min-h-screen px-6 py-16 max-w-5xl mx-auto">
      <header className="flex items-center justify-between mb-12">
        <div>
          <h1 className="text-4xl font-light">sua bolha</h1>
          <p className="text-neutral-500 text-sm mt-1">{profile?.email}</p>
        </div>
        <div className="flex gap-3">
          <Link href="/profile/feedback" className="text-sm text-neutral-400 hover:text-white">
            feedback
          </Link>
          <Link href="/" className="text-sm text-neutral-400 hover:text-white">
            voltar
          </Link>
          <LogoutButton />
        </div>
      </header>

      <section className="mb-12">
        <h2 className="text-xs tracking-[0.2em] text-neutral-500 mb-4">INTEGRAÇÕES</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Spotify: mostra estado conectado se já tem spotify_id */}
          {profile?.spotify_id ? (
            <div className="border border-green-800/50 rounded-xl p-5">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-medium">Spotify</h3>
                <span className="text-[10px] text-green-400 flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400" />
                  conectado
                </span>
              </div>
              <p className="text-xs text-neutral-500">
                Sua vibe musical está sendo usada nas recomendações.
              </p>
            </div>
          ) : (
            <div className="border border-neutral-800 rounded-xl p-5">
              <h3 className="text-sm font-medium mb-1">Spotify</h3>
              <p className="text-xs text-neutral-500 mb-3">
                Conecte para gerar uma vibe personalizada.
              </p>
              <a
                href="/api/spotify/connect"
                className="inline-block bg-[#1DB954] text-black px-4 py-2 rounded-lg text-sm font-medium"
              >
                conectar Spotify
              </a>
            </div>
          )}
          <LastfmConnect initialUsername={profile?.lastfm_username} />
          <LetterboxdConnect initialUsername={profile?.letterboxd_username} />
          <GoodreadsImport alreadyImported={goodreadsImports.count > 0} />
        </div>
      </section>

      {/* Top artistas Spotify */}
      {topArtists.length > 0 && (
        <section className="mb-12">
          <h2 className="text-xs tracking-[0.2em] text-neutral-500 mb-4">TOP ARTISTAS · SPOTIFY</h2>
          <div className="grid grid-cols-5 gap-4">
            {topArtists.slice(0, 5).map((a) => (
              <div key={a.id} className="text-center">
                <div className="relative aspect-square rounded-full overflow-hidden bg-neutral-900">
                  {a.image && (
                    <Image src={a.image} alt={a.name} fill sizes="150px" className="object-cover" />
                  )}
                </div>
                <p className="text-sm mt-2 truncate">{a.name}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Top artistas Last.fm */}
      {lastfmArtists.length > 0 && (
        <section className="mb-12">
          <h2 className="text-xs tracking-[0.2em] text-neutral-500 mb-4">TOP ARTISTAS · LAST.FM</h2>
          <div className="grid grid-cols-5 gap-4">
            {lastfmArtists.slice(0, 5).map((a) => (
              <div key={a.name} className="text-center">
                <div className="relative aspect-square rounded-full overflow-hidden bg-neutral-900">
                  {a.image && (
                    <Image src={a.image} alt={a.name} fill sizes="150px" className="object-cover" />
                  )}
                </div>
                <p className="text-sm mt-2 truncate">{a.name}</p>
                <p className="text-[10px] text-neutral-600">{a.playcount} plays</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Filmes do Letterboxd */}
      {letterboxdFilms.length > 0 && (
        <section className="mb-12">
          <h2 className="text-xs tracking-[0.2em] text-neutral-500 mb-4">DIARY · LETTERBOXD</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {letterboxdFilms.slice(0, 10).map((f, i) => (
              <div key={`${f.title}-${i}`} className="border border-neutral-800 rounded-lg p-3">
                <p className="text-sm truncate">{f.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  {f.year && <span className="text-[10px] text-neutral-600">{f.year}</span>}
                  {f.rating && (
                    <span className="text-[10px] text-amber-400">
                      {"★".repeat(Math.round(f.rating))}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Livros do Goodreads */}
      {goodreadsImports.items.length > 0 && (
        <section className="mb-12">
          <h2 className="text-xs tracking-[0.2em] text-neutral-500 mb-4">
            BIBLIOTECA · GOODREADS
            <span className="text-neutral-600 ml-2">({goodreadsImports.count} livros)</span>
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {goodreadsImports.items.slice(0, 10).map((b: any) => (
              <div key={b.id} className="border border-neutral-800 rounded-lg p-3">
                <p className="text-sm truncate">{b.title}</p>
                {b.author && <p className="text-[10px] text-neutral-500 truncate">{b.author}</p>}
                {b.rating && b.rating > 0 && (
                  <span className="text-[10px] text-amber-400">
                    {"★".repeat(b.rating)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {profile?.vibe_tags && profile.vibe_tags.length > 0 && (
        <section className="mb-12">
          <h2 className="text-xs tracking-[0.2em] text-neutral-500 mb-4">SUA VIBE</h2>
          <div className="flex flex-wrap gap-2">
            {profile.vibe_tags.map((t: string) => (
              <span
                key={t}
                className="border border-neutral-700 rounded-full px-3 py-1 text-sm"
              >
                {t}
              </span>
            ))}
          </div>
        </section>
      )}

      {history && history.length > 0 && (
        <section>
          <h2 className="text-xs tracking-[0.2em] text-neutral-500 mb-4">HISTÓRICO</h2>
          <ul className="space-y-2">
            {history.map((h: any) => (
              <li key={h.id} className="flex gap-3 items-center text-sm">
                <span className="text-neutral-500 text-[10px] w-12">
                  {h.catalog_items?.type}
                </span>
                <span>{h.catalog_items?.title}</span>
                <span className="text-neutral-500">— {h.catalog_items?.creator}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
