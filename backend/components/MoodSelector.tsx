"use client";

const MOODS = [
  {
    key: "melancholic",
    emoji: "😔",
    label: "Melancólico",
    prompt: "Priorize obras com atmosfera introspectiva, tons sombrios e ritmo contemplativo.",
  },
  {
    key: "energized",
    emoji: "⚡",
    label: "Energizado",
    prompt: "Priorize obras com energia alta, ritmo acelerado e sensação de urgência ou euforia.",
  },
  {
    key: "calm",
    emoji: "🧘",
    label: "Tranquilo",
    prompt: "Priorize obras com atmosfera calma, minimalista, sem conflito intenso.",
  },
  {
    key: "euphoric",
    emoji: "🤩",
    label: "Eufórico",
    prompt: "Priorize obras celebratórias, vibrantes, com sensação de alegria ou grandiosidade.",
  },
  {
    key: "thoughtful",
    emoji: "🤔",
    label: "Pensativo",
    prompt: "Priorize obras que provocam reflexão profunda, com múltiplas camadas de significado.",
  },
] as const;

export type MoodKey = (typeof MOODS)[number]["key"];

/** Retorna o texto de prompt associado a um mood, ou string vazia. */
export function getMoodPrompt(key: string | null): string {
  return MOODS.find((m) => m.key === key)?.prompt ?? "";
}

type Props = {
  selected: string | null;
  onChange: (mood: string | null) => void;
};

export default function MoodSelector({ selected, onChange }: Props) {
  return (
    <div className="w-full max-w-2xl mx-auto mt-6">
      <p className="text-xs text-neutral-500 text-center mb-3">
        Como você está agora? <span className="text-neutral-600">(opcional)</span>
      </p>
      <div className="flex gap-2 justify-center flex-wrap">
        {MOODS.map((m) => {
          const isActive = selected === m.key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => onChange(isActive ? null : m.key)}
              className={`
                px-3 py-1.5 rounded-full text-sm border transition-all duration-150
                ${isActive
                  ? "bg-white text-black border-white"
                  : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
                }
              `}
            >
              <span className="mr-1">{m.emoji}</span>
              {m.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
