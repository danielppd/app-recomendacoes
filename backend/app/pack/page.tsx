"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

type PackItem = {
  id: string;
  title: string;
  creator: string;
  type: string;
  coverUrl: string | null;
  connectionPhrase: string;
  similarityScore: number;
};

type Pack = {
  title: string;
  mood: string;
  vibeDescription: string;
  items: PackItem[];
  savedId?: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  film: "FILME",
  book: "LIVRO",
  music: "MÚSICA",
  place: "LUGAR",
};

export default function PackPage() {
  const [mood, setMood] = useState("");
  const [loading, setLoading] = useState(false);
  const [pack, setPack] = useState<Pack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!mood.trim()) return;
    setLoading(true);
    setError(null);
    setPack(null);
    setExpandedId(null);
    setSavedId(null);
    try {
      const res = await fetch("/api/pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mood: mood.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "erro");
      setPack(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!pack || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Reenvia o mood com save=true. A API regenera o pack, mas o custo
        // é baixo e garante consistência. Alternativa seria um endpoint PUT
        // separado, mas para MVP isso é suficiente.
        body: JSON.stringify({ mood: pack.mood, save: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "erro ao salvar");
      setSavedId(data.savedId);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen px-6 py-16 md:py-24">
      <div className="max-w-3xl mx-auto">
        <nav className="flex justify-between items-center text-sm text-neutral-400 mb-8">
          <Link href="/" className="hover:text-white">← bubble</Link>
        </nav>

        <header className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-light tracking-tight">bubble pack</h1>
          <p className="text-neutral-500 mt-3">
            descreva um mood e receba uma curadoria perfeita
          </p>
        </header>

        <form onSubmit={handleGenerate} className="w-full max-w-xl mx-auto mb-12">
          <input
            type="text"
            value={mood}
            onChange={(e) => setMood(e.target.value)}
            placeholder="noite chuvosa de domingo..."
            disabled={loading}
            className="w-full bg-transparent border-b border-neutral-700 focus:border-white outline-none text-xl md:text-3xl py-4 text-center placeholder-neutral-600 transition"
          />
          <button
            type="submit"
            disabled={loading || !mood.trim()}
            className="mt-6 mx-auto block px-8 py-2.5 rounded-full border border-neutral-700 text-sm hover:border-white hover:bg-white hover:text-black transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {loading ? "gerando pack..." : "gerar pack"}
          </button>
        </form>

        {loading && (
          <p className="text-center text-neutral-400 animate-pulse">
            Montando seu pack...
          </p>
        )}

        {error && <p className="text-center text-red-400">{error}</p>}

        {pack && !loading && (
          <div className="animate-fade-in">
            {/* Título do pack */}
            <h2 className="text-2xl md:text-3xl font-light text-center mb-2">
              {pack.title}
            </h2>
            <p className="text-center text-neutral-500 text-sm italic mb-8 max-w-lg mx-auto">
              {pack.vibeDescription}
            </p>

            {/* Grid 2x2 com os 4 itens */}
            <div className="grid grid-cols-2 gap-4 max-w-2xl mx-auto">
              {pack.items.map((item) => {
                const isExpanded = expandedId === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    className="relative group text-left rounded-xl overflow-hidden border border-neutral-800 hover:border-neutral-600 transition-all duration-200"
                  >
                    {/* Capa (aspect 2:3) */}
                    <div className="relative aspect-[2/3] w-full bg-neutral-800">
                      {item.coverUrl ? (
                        <Image
                          src={item.coverUrl}
                          alt={item.title}
                          fill
                          sizes="(max-width: 768px) 50vw, 300px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-neutral-800 via-neutral-900 to-black">
                          <span className="text-5xl font-light text-neutral-600">
                            {item.title.charAt(0)}
                          </span>
                        </div>
                      )}

                      {/* Overlay com info — sempre visível na parte inferior */}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 pt-12">
                        <span className="text-[9px] tracking-[0.2em] text-neutral-400 uppercase">
                          {TYPE_LABEL[item.type] ?? item.type}
                        </span>
                        <h3 className="text-sm font-medium leading-tight mt-0.5">
                          {item.title}
                        </h3>
                        <p className="text-xs text-neutral-400">{item.creator}</p>
                      </div>
                    </div>

                    {/* Frase de conexão — expande ao clicar */}
                    {isExpanded && item.connectionPhrase && (
                      <div className="px-4 py-3 bg-neutral-900/95 border-t border-neutral-800 animate-fade-in">
                        <p className="text-xs italic text-neutral-300 leading-relaxed">
                          "{item.connectionPhrase}"
                        </p>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Botão salvar */}
            <div className="text-center mt-8">
              {savedId ? (
                <p className="text-sm text-neutral-400">
                  Pack salvo com sucesso
                </p>
              ) : (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-8 py-2.5 rounded-full border border-neutral-700 text-sm hover:border-white hover:bg-white hover:text-black transition disabled:opacity-50"
                >
                  {saving ? "salvando..." : "salvar pack"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
