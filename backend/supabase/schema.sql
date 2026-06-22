-- Rode este arquivo no SQL Editor do Supabase antes do seed.

create extension if not exists vector;

create table if not exists catalog_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  creator text,
  type text not null check (type in ('film', 'book', 'music', 'event')),
  year int,
  cover_url text,
  vibe_description text,
  embedding vector(768),
  metadata jsonb,
  external_id text,
  language text,
  rating numeric(3,1),
  genres text[],
  created_at timestamptz default now()
);

create index if not exists idx_catalog_items_type on catalog_items(type);

create index if not exists catalog_items_embedding_idx
  on catalog_items using ivfflat (embedding vector_cosine_ops);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  artist_searched text,
  created_at timestamptz default now()
);

-- Função RPC: dado um vetor de query, devolve os N itens mais próximos
-- (similaridade de cosseno). Usada pelo /api/recommend.
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
  similarity float
)
language sql stable
as $$
  select
    c.id, c.title, c.creator, c.type, c.year, c.cover_url, c.vibe_description,
    c.external_id, c.language, c.rating, c.genres,
    1 - (c.embedding <=> query_embedding) as similarity
  from catalog_items c
  where filter_type is null or c.type = filter_type
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
