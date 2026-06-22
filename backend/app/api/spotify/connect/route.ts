// Inicia o OAuth do Spotify: gera um state aleatório, salva em cookie e
// redireciona o usuário para a tela de consentimento.
import { NextResponse } from "next/server";
import { buildAuthUrl } from "@/lib/spotify";
import { createClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_SITE_URL!));

  const state = crypto.randomUUID();
  const url = buildAuthUrl(state);
  const res = NextResponse.redirect(url);
  res.cookies.set("spotify_state", state, { httpOnly: true, maxAge: 600, path: "/" });
  return res;
}
