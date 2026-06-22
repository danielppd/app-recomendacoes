import { createClient } from "@supabase/supabase-js";

// Cliente "admin" usando a service role key. Usar APENAS no server (API routes
// e scripts) — nunca expor ao cliente.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);
