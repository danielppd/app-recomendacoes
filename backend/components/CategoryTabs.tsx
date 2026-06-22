"use client";

type Tab = {
  key: string;
  label: string;
  icon: string;
};

const TABS: Tab[] = [
  { key: "all", label: "Todos", icon: "" },
  { key: "film", label: "Filmes", icon: "🎬" },
  { key: "book", label: "Livros", icon: "📚" },
  { key: "music", label: "Música", icon: "🎵" },
  { key: "place", label: "Lugares", icon: "📍" },
];

type Props = {
  selected: string;
  counts: Record<string, number>;
  onChange: (tab: string) => void;
};

export default function CategoryTabs({ selected, counts, onChange }: Props) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="flex gap-2 flex-wrap justify-center">
      {TABS.map((tab) => {
        const count = tab.key === "all" ? total : (counts[tab.key] ?? 0);
        const isActive = selected === tab.key;
        // Tabs com 0 itens ficam visíveis mas desabilitadas (acinzentadas)
        const isEmpty = tab.key !== "all" && count === 0;

        return (
          <button
            key={tab.key}
            onClick={() => !isEmpty && onChange(tab.key)}
            disabled={isEmpty}
            className={`
              px-4 py-2 rounded-full text-sm border transition-all duration-150
              ${isActive
                ? "bg-white text-black border-white"
                : isEmpty
                  ? "border-neutral-800 text-neutral-600 cursor-not-allowed opacity-50"
                  : "border-neutral-700 text-neutral-300 hover:border-neutral-500"
              }
            `}
          >
            {tab.icon && <span className="mr-1">{tab.icon}</span>}
            {tab.label}
            <span className="ml-1.5 text-xs opacity-70">({count})</span>
          </button>
        );
      })}
    </div>
  );
}
