-- Migration: Cria tabela query_cache para cachear vibe descriptions e embeddings
-- Rode no SQL Editor do Supabase (Dashboard > SQL Editor > New query)

create table if not exists query_cache (
  id uuid default gen_random_uuid() primary key,
  query_type text not null,          -- 'vibe_description' | 'embedding'
  query_input text not null,          -- chave: texto da busca ou hash do input
  vibe_description text,              -- resultado do Groq (quando query_type = 'vibe_description')
  embedding vector(768),              -- resultado do Gemini (quando query_type = 'embedding')
  created_at timestamptz default now(),
  hit_count integer default 0,
  unique (query_type, query_input)
);

-- Índice para buscas rápidas por tipo + input
create index if not exists idx_query_cache_lookup on query_cache(query_type, query_input);

-- Função para limpar cache antigo (> 7 dias sem hits)
create or replace function cleanup_stale_cache()
returns void language sql as $$
  delete from query_cache
  where created_at < now() - interval '7 days'
    and hit_count < 2;
$$;
