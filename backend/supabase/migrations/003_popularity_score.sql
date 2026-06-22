-- Migration: Adiciona popularity_score ao catalog_items
-- Normalizado para 0-1 (log-scaled do campo popularity da TMDB ou ratingsCount do Google Books)
-- Usado para filtro de "grau de underground" no futuro

alter table catalog_items
  add column if not exists popularity_score real;

-- Indice para queries rapidas por popularidade (ex: filtro underground)
create index if not exists idx_catalog_items_popularity on catalog_items(popularity_score);

-- Atualiza o RPC match_catalog_items para retornar popularity_score tambem
-- (permite filtrar por underground no pipeline de recomendacao futuramente)
-- DROP necessario: Postgres nao permite CREATE OR REPLACE quando o return type muda.
drop function if exists match_catalog_items(vector, integer, text);

create or replace function match_catalog_items(
  query_embedding vector(768),
  match_count int default 5,
  filter_type text default null
)
returns table (
  id uuid,
  title text,
  creator text,
  type text,
  year int,
  cover_url text,
  vibe_description text,
  external_id text,
  language text,
  rating numeric,
  genres text[],
  popularity_score real,
  similarity float
)
language sql stable
as $$
  select
    c.id, c.title, c.creator, c.type, c.year, c.cover_url, c.vibe_description,
    c.external_id, c.language, c.rating, c.genres, c.popularity_score,
    1 - (c.embedding <=> query_embedding) as similarity
  from catalog_items c
  where filter_type is null or c.type = filter_type
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
