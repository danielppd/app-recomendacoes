import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// Captura simples de e-mail. Salva (email, artist_searched) na tabela leads.
export async function POST(req: NextRequest) {
  try {
    const { email, artist } = await req.json();
    if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

    const { error } = await supabaseAdmin
      .from("leads")
      .upsert({ email, artist_searched: artist ?? null }, { onConflict: "email" });
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
