// Acesso à tabela bubble_packs via Supabase SDK (protegida por RLS).
// Parte do seam de dados — salvar/listar o histórico do usuário.
import { supabase } from "./supabase";
import type { Pack, PackItem } from "../types";

export interface SavedPack {
  id: string;
  title: string;
  mood_input: string;
  items: PackItem[];
  created_at: string;
}

/** Salva o pack atual no histórico do usuário logado. */
export async function savePack(pack: Pack): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Faça login para salvar packs.");

  const { data, error } = await supabase
    .from("bubble_packs")
    .insert({
      user_id: user.id,
      title: pack.title,
      mood_input: pack.mood,
      items: pack.items,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data.id as string;
}

/** Lista os packs salvos do usuário, mais recentes primeiro. */
export async function listSavedPacks(): Promise<SavedPack[]> {
  const { data, error } = await supabase
    .from("bubble_packs")
    .select("id, title, mood_input, items, created_at")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as SavedPack[];
}

/** Converte um registro salvo de volta no formato Pack para a tela de Pack. */
export function savedToPack(s: SavedPack): Pack {
  return {
    title: s.title,
    mood: s.mood_input,
    vibeDescription: "",
    items: s.items,
    savedId: s.id,
  };
}
