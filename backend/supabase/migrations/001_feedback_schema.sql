-- Migration: Atualiza user_feedback para o schema completo
-- Rode no SQL Editor do Supabase (Dashboard → SQL Editor → New query)

-- 1. Adiciona colunas novas
alter table user_feedback
  add column if not exists item_type text,
  add column if not exists query_context text;

-- 2. Renomeia reaction → feedback
alter table user_feedback
  rename column reaction to feedback;

-- 3. Remove o CHECK constraint antigo (só permitia 'like'/'dislike')
alter table user_feedback
  drop constraint if exists user_feedback_reaction_check;

-- 4. Converte valores existentes: like→liked, dislike→disliked
update user_feedback set feedback = 'liked' where feedback = 'like';
update user_feedback set feedback = 'disliked' where feedback = 'dislike';

-- 5. Adiciona novo CHECK constraint com os valores atualizados
alter table user_feedback
  add constraint user_feedback_feedback_check check (feedback in ('liked', 'disliked'));

-- 6. Preenche item_type dos registros antigos a partir do catalog_items
update user_feedback uf
  set item_type = ci.type
  from catalog_items ci
  where uf.item_id = ci.id
    and uf.item_type is null;

-- 7. Cria índice para consultas rápidas de feedback por usuário
create index if not exists idx_user_feedback_user_id on user_feedback(user_id);

-- 8. Cria RPC para buscar feedback existente de um usuário para uma lista de itens
create or replace function get_user_feedback(p_user_id uuid, p_item_ids uuid[])
returns table (item_id uuid, feedback text)
language sql stable
as $$
  select uf.item_id, uf.feedback
  from user_feedback uf
  where uf.user_id = p_user_id
    and uf.item_id = any(p_item_ids);
$$;
