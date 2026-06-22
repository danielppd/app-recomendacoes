"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";

type SpotifyArtist = {
  id: string;
  name: string;
  image: string | null;
  genres: string[];
};

const RECENT_KEY = "bubble_recent_searches";
const MAX_RECENT = 5;

function getRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]").slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function saveRecentSearch(term: string) {
  const recent = getRecentSearches().filter((s) => s !== term);
  recent.unshift(term);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

const SEARCH_TYPES = [
  { key: "artist", label: "Artista", icon: "🎵" },
  { key: "film", label: "Filme", icon: "🎬" },
  { key: "book", label: "Livro", icon: "📚" },
  { key: "mood", label: "Mood livre", icon: "✨" },
] as const;

type SearchType = (typeof SEARCH_TYPES)[number]["key"];

const PLACEHOLDERS: Record<SearchType, string> = {
  artist: "Digite um artista...",
  film: "Digite um filme...",
  book: "Digite um livro...",
  mood: "Descreva um mood ou momento...",
};

export default function SearchBar({
  onSearch,
  loading,
}: {
  onSearch: (input: string, searchType: string) => void;
  loading: boolean;
}) {
  const [value, setValue] = useState("");
  const [searchType, setSearchType] = useState<SearchType>("artist");
  const [suggestions, setSuggestions] = useState<SpotifyArtist[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [fetching, setFetching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Carrega histórico quando o campo recebe foco
  function handleFocus() {
    setRecentSearches(getRecentSearches());
    setShowDropdown(true);
  }

  const fetchSuggestions = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSuggestions([]);
      return;
    }
    setFetching(true);
    try {
      const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setSuggestions(data.artists ?? []);
    } catch {
      // Fallback gracioso: não mostra sugestões, input continua funcionando
      setSuggestions([]);
    } finally {
      setFetching(false);
    }
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setValue(v);
    setShowDropdown(true);

    // Autocomplete Spotify só faz sentido para busca por artista
    if (searchType === "artist") {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => fetchSuggestions(v), 300);
    } else {
      setSuggestions([]);
    }
  }

  function handleSelect(name: string) {
    setValue(name);
    setShowDropdown(false);
    setSuggestions([]);
    saveRecentSearch(name);
    onSearch(name, searchType);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (value.trim()) {
      setShowDropdown(false);
      saveRecentSearch(value.trim());
      onSearch(value.trim(), searchType);
    }
  }

  function handleTypeChange(type: SearchType) {
    setSearchType(type);
    setSuggestions([]);
    // Limpa sugestões ao trocar tipo; mantém o texto digitado
  }

  // Decide o que mostrar no dropdown:
  // - Se tem texto digitado e sugestões → mostra sugestões do Spotify
  // - Se input vazio e tem histórico → mostra histórico
  const showSuggestions = value.trim().length > 0 && suggestions.length > 0;
  const showRecent = value.trim().length === 0 && recentSearches.length > 0;
  const dropdownVisible = showDropdown && !loading && (showSuggestions || showRecent);

  return (
    <div ref={wrapperRef} className="w-full max-w-2xl mx-auto relative">
      {/* Seletor de tipo de busca (pills) */}
      <div className="flex gap-2 justify-center mb-6">
        {SEARCH_TYPES.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => handleTypeChange(t.key)}
            disabled={loading}
            className={`
              px-4 py-1.5 rounded-full text-sm border transition-all duration-150
              ${searchType === t.key
                ? "bg-white text-black border-white"
                : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
              }
            `}
          >
            <span className="mr-1">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={value}
          onChange={handleChange}
          onFocus={handleFocus}
          placeholder={PLACEHOLDERS[searchType]}
          disabled={loading}
          className="w-full bg-transparent border-b border-neutral-700 focus:border-white outline-none text-2xl md:text-4xl py-4 text-center placeholder-neutral-600 transition"
        />
      </form>

      {dropdownVisible && (
        <div className="absolute z-50 w-full mt-2 bg-neutral-900 border border-neutral-700 rounded-xl overflow-hidden shadow-2xl">
          {/* Sugestões do Spotify */}
          {showSuggestions &&
            suggestions.map((artist) => (
              <button
                key={artist.id}
                onClick={() => handleSelect(artist.name)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-800 transition text-left"
              >
                {/* Foto do artista */}
                <div className="w-10 h-10 rounded-full bg-neutral-800 overflow-hidden flex-shrink-0">
                  {artist.image ? (
                    <Image
                      src={artist.image}
                      alt={artist.name}
                      width={40}
                      height={40}
                      className="object-cover w-full h-full"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-neutral-600 text-sm">
                      {artist.name.charAt(0)}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{artist.name}</p>
                  {artist.genres.length > 0 && (
                    <p className="text-xs text-neutral-500 truncate">
                      {artist.genres.join(", ")}
                    </p>
                  )}
                </div>
              </button>
            ))}

          {/* Histórico de buscas recentes */}
          {showRecent && (
            <>
              <div className="px-4 py-2 text-[10px] tracking-widest text-neutral-500 uppercase">
                Buscas recentes
              </div>
              {recentSearches.map((term) => (
                <button
                  key={term}
                  onClick={() => handleSelect(term)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-800 transition text-left"
                >
                  <span className="text-neutral-500 text-sm">↩</span>
                  <span className="text-sm">{term}</span>
                </button>
              ))}
            </>
          )}

          {/* Indicador de carregamento discreto */}
          {fetching && value.trim() && (
            <div className="px-4 py-2 text-xs text-neutral-500 animate-pulse">
              Buscando...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
