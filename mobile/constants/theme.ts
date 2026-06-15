// Identidade visual do Bubble (espelha bubble/app/globals.css)
export const colors = {
  bg: "#0f0f0f",
  surface: "#1a1a1a",
  surfaceAlt: "#242424",
  border: "#2e2e2e",
  text: "#f5f5f5",
  textMuted: "#a3a3a3",
  accent: "#a855f7", // roxo "bubble"
  accentMuted: "#7e3ff2",
  danger: "#f87171",
};

// Cor por tipo de item do pack
export const typeMeta: Record<string, { label: string; color: string }> = {
  film: { label: "Filme", color: "#f59e0b" },
  book: { label: "Livro", color: "#34d399" },
  music: { label: "Música", color: "#60a5fa" },
  place: { label: "Lugar", color: "#f472b6" },
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
export const radius = { sm: 8, md: 12, lg: 16, xl: 24 };
