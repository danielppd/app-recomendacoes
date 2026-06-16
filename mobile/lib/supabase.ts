// Cliente Supabase do app — parte do SEAM de dados (auth + persistência).
// Usa apenas valores PÚBLICOS (URL + anon key), seguros no cliente. A sessão é
// persistida via AsyncStorage (suporte first-class do supabase-js a RN).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

if (!url || !anonKey) {
  console.warn(
    "[supabase] EXPO_PUBLIC_SUPABASE_URL/ANON_KEY ausentes — auth e histórico não vão funcionar."
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // app nativo, sem URL de callback
  },
});
