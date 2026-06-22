"use client";
// Card de recomendacao + botoes de feedback.
import { useState } from "react";
import Image from "next/image";

type Props = {
  id: string;
  title: string;
  creator: string;
  type: string;
  coverUrl: string | null;
  connectionPhrase: string;
  similarityScore?: number;
  genres?: string[];
  showScores?: boolean;
  existingFeedback?: "liked" | "disliked" | null;
  queryContext?: string;
};

const TYPE_LABEL: Record<string, string> = {
  film: "FILME",
  book: "LIVRO",
  music: "MUSICA",
  place: "LUGAR",
};

export default function RecommendationCard({
  id,
  title,
  creator,
  type,
  coverUrl,
  connectionPhrase,
  similarityScore,
  genres = [],
  showScores = false,
  existingFeedback = null,
  queryContext,
}: Props) {
  const matchPct =
    typeof similarityScore === "number" ? Math.round(similarityScore * 100) : null;

  const [feedback, setFeedback] = useState<"liked" | "disliked" | null>(existingFeedback);
  const [msg, setMsg] = useState<string | null>(null);

  async function sendFeedback(r: "liked" | "disliked") {
    setFeedback(r);
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: id, itemType: type, feedback: r, queryContext }),
    });
    if (res.status === 401) {
      setMsg("entre para salvar feedback");
      setFeedback(null);
    } else if (!res.ok) {
      setMsg("erro");
      setFeedback(null);
    }
  }

  return (
    <div className={`group relative bg-neutral-900/60 border rounded-2xl p-5 flex flex-col gap-3 transition duration-200 hover:border-neutral-600 hover:scale-[1.02] ${existingFeedback ? "border-neutral-700/50 opacity-70" : "border-neutral-800"}`}>
      {showScores && matchPct !== null && (
        <div className="absolute top-3 right-3 z-10 bg-black/70 backdrop-blur text-[10px] tracking-wider px-2 py-1 rounded-full border border-neutral-700">
          {matchPct}% match
        </div>
      )}

      <div className="relative aspect-[2/3] w-full bg-neutral-800 rounded-lg overflow-hidden">
        {coverUrl ? (
          <Image
            src={coverUrl}
            alt={title}
            fill
            sizes="(max-width: 768px) 100vw, 400px"
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-neutral-800 via-neutral-900 to-black">
            <span className="text-6xl font-light text-neutral-600">
              {title.charAt(0)}
            </span>
          </div>
        )}
      </div>

      <div>
        <span className="text-[10px] tracking-[0.2em] text-neutral-500">
          {TYPE_LABEL[type] ?? type.toUpperCase()}
        </span>
        <h3 className="text-lg font-medium leading-tight mt-1">{title}</h3>
        <p className="text-sm text-neutral-400">{creator}</p>

        {genres.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {genres.slice(0, 3).map((g) => (
              <span
                key={g}
                className="text-[10px] text-neutral-400 border border-neutral-800 rounded-full px-2 py-0.5"
              >
                {g}
              </span>
            ))}
          </div>
        )}
      </div>

      {connectionPhrase ? (
        <p className="italic text-sm text-neutral-300 border-t border-neutral-800 pt-3">
          &ldquo;{connectionPhrase}&rdquo;
        </p>
      ) : (
        <div className="border-t border-neutral-800 pt-3">
          <div className="h-4 w-3/4 bg-neutral-800 rounded animate-pulse" />
          <div className="h-4 w-1/2 bg-neutral-800 rounded animate-pulse mt-1" />
        </div>
      )}

      <div className="flex gap-2 items-center">
        <button
          onClick={() => sendFeedback("liked")}
          className={`text-xs px-3 py-1.5 rounded-full border transition ${
            feedback === "liked"
              ? "bg-white text-black border-white"
              : "border-neutral-700 hover:border-white"
          }`}
        >
          gostei
        </button>
        <button
          onClick={() => sendFeedback("disliked")}
          className={`text-xs px-3 py-1.5 rounded-full border transition ${
            feedback === "disliked"
              ? "bg-neutral-700 text-white border-neutral-700"
              : "border-neutral-700 hover:border-white"
          }`}
        >
          nao curti
        </button>
        {msg && <span className="text-[10px] text-neutral-500">{msg}</span>}
      </div>
    </div>
  );
}
