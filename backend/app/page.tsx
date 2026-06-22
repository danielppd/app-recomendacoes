"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import SearchBar from "@/components/SearchBar";
import RecommendationCard from "@/components/RecommendationCard";
import CategoryTabs from "@/components/CategoryTabs";
import WeatherBadge from "@/components/WeatherBadge";
import MoodSelector, { getMoodPrompt } from "@/components/MoodSelector";
import EmailCapture from "@/components/EmailCapture";
import { createClient } from "@/lib/supabase-browser";
import type { WeatherContext } from "@/lib/weather";

type Recommendation = {
  id: string;
  title: string;
  creator: string;
  type: string;
  coverUrl: string | null;
  connectionPhrase: string;
  similarityScore: number;
  genres?: string[];
  externalId?: string | null;
  language?: string | null;
  rating?: number | null;
  existingFeedback?: "liked" | "disliked" | null;
};

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [artist, setArtist] = useState<string | null>(null);
  const [vibe, setVibe] = useState<string | null>(null);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [showScores, setShowScores] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [lastSearchType, setLastSearchType] = useState<string>("artist");
  const weatherRef = useRef<WeatherContext | null>(null);
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  // Session cache: IDs ja exibidos pra reduzir repeticao entre buscas (soft — backend cai de volta se sobrar pouco pool)
  const shownIdsRef = useRef<Set<string>>(new Set());

  // Contagem de itens por categoria — recalcula quando recs muda
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { film: 0, book: 0, music: 0, place: 0 };
    for (const r of recs) {
      counts[r.type] = (counts[r.type] ?? 0) + 1;
    }
    return counts;
  }, [recs]);

  // Filtra recomendações pela tab ativa
  const filteredRecs = useMemo(
    () => (activeTab === "all" ? recs : recs.filter((r) => r.type === activeTab)),
    [recs, activeTab]
  );

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
      // Carrega o humor salvo no perfil (persiste entre sessões)
      if (data.user) {
        supabase
          .from("profiles")
          .select("last_mood")
          .eq("id", data.user.id)
          .single()
          .then(({ data: prof }) => {
            if (prof?.last_mood) setSelectedMood(prof.last_mood);
          });
      }
    });
  }, []);

  function handleMoodChange(mood: string | null) {
    setSelectedMood(mood);
    // Persiste no perfil do Supabase se logado
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        supabase
          .from("profiles")
          .update({ last_mood: mood, mood_updated_at: new Date().toISOString() })
          .eq("id", data.user.id)
          .then(() => {});
      }
    });
  }

  async function handleSearch(input: string, searchType: string = "artist") {
    setLoading(true);
    setError(null);
    setRecs([]);
    setVibe(null);
    setArtist(input);

    if (searchType !== lastSearchType) {
      setActiveTab("all");
      setLastSearchType(searchType);
    }

    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artist: input,
          searchType,
          weather: weatherRef.current,
          mood: getMoodPrompt(selectedMood),
          excludeIds: Array.from(shownIdsRef.current),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "erro");
      }

      // Consome stream NDJSON progressivamente
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let cardsReceived: Recommendation[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);

          if (event.type === "vibe") {
            setVibe(event.vibeDescription);
          } else if (event.type === "cards") {
            setShowScores(event.showScores ?? false);
            cardsReceived = event.recommendations;
            // Registra IDs desta rodada no session cache (soft dedupe nas proximas buscas)
            for (const r of cardsReceived) shownIdsRef.current.add(r.id);
            setRecs([...cardsReceived]);
            setLoading(false); // Cards visíveis — para o spinner
          } else if (event.type === "phrases") {
            // Atualiza cada card com sua connection phrase
            const phrases: Record<string, string> = event.phrases;
            cardsReceived = cardsReceived.map((r) => ({
              ...r,
              connectionPhrase: phrases[r.id] ?? r.connectionPhrase,
            }));
            setRecs([...cardsReceived]);
          } else if (event.type === "error") {
            throw new Error(event.error);
          }
        }
      }

      // Busca feedback existente para reordenar cards avaliados
      if (cardsReceived.length > 0) {
        const ids = cardsReceived.map((r) => r.id);
        try {
          const fbRes = await fetch(`/api/feedback?itemIds=${ids.join(",")}`);
          const fbData = await fbRes.json();
          const feedbacks: Record<string, string> = fbData.feedbacks ?? {};
          let updated = cardsReceived.map((r) => ({
            ...r,
            existingFeedback: (feedbacks[r.id] as "liked" | "disliked") ?? null,
          }));
          updated.sort((a, b) => {
            const aHas = a.existingFeedback ? 1 : 0;
            const bHas = b.existingFeedback ? 1 : 0;
            return aHas - bHas;
          });
          setRecs(updated);
        } catch {
          // Falha silenciosa — feedback é best-effort
        }
      }
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen px-6 py-16 md:py-24">
      <div className="max-w-5xl mx-auto">
        <nav className="flex justify-end gap-4 text-sm text-neutral-400 mb-8">
          <Link href="/pack" className="hover:text-white">pack</Link>
          {userEmail ? (
            <Link href="/profile" className="hover:text-white">sua bolha</Link>
          ) : (
            <Link href="/login" className="hover:text-white">entrar</Link>
          )}
        </nav>
        <header className="text-center mb-16">
          <h1 className="text-5xl md:text-7xl font-light tracking-tight">bubble</h1>
          <p className="text-neutral-500 mt-3">descubra coisas novas pela mesma vibe</p>
        </header>

        <SearchBar onSearch={handleSearch} loading={loading} />
        <div className="max-w-2xl mx-auto">
          <WeatherBadge onLoad={(ctx) => (weatherRef.current = ctx)} />
        </div>
        <MoodSelector selected={selectedMood} onChange={handleMoodChange} />

        {loading && (
          <p className="text-center text-neutral-400 mt-12 animate-pulse">
            Calculando sua vibe...
          </p>
        )}

        {error && <p className="text-center text-red-400 mt-12">{error}</p>}

        {vibe && (
          <p className="max-w-2xl mx-auto text-center text-neutral-400 italic mt-12">
            {vibe}
          </p>
        )}

        {recs.length > 0 && !loading && (
          <>
            <div className="mt-10">
              <CategoryTabs
                selected={activeTab}
                counts={categoryCounts}
                onChange={setActiveTab}
              />
            </div>

            {/* Animação suave ao trocar de tab (opacity 150ms) */}
            <div
              key={activeTab}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-8 animate-fade-in"
            >
              {filteredRecs.map((r) => (
                <RecommendationCard
                  key={r.id}
                  {...r}
                  showScores={showScores}
                  existingFeedback={r.existingFeedback}
                  queryContext={artist ?? undefined}
                />
              ))}
            </div>
            <EmailCapture artist={artist} />
          </>
        )}
      </div>
    </main>
  );
}
