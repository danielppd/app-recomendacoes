"use client";
// Página de login: email/senha + Google OAuth.
// Na submissão de email/senha tenta signIn; se falhar com "Invalid credentials",
// cai em signUp automaticamente (fluxo simplificado para MVP).
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AuthResponse } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-browser";

// useSearchParams exige um Suspense boundary na geração estática (Next 14).
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    let res: AuthResponse = await supabase.auth.signInWithPassword({ email, password });
    if (res.error && /invalid/i.test(res.error.message)) {
      res = await supabase.auth.signUp({ email, password });
    }
    setLoading(false);
    if (res.error) return setError(res.error.message);
    router.push(next);
    router.refresh();
  }

  async function google() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/api/auth/callback?next=${next}` },
    });
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-4xl font-light text-center mb-10">bubble</h1>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3 outline-none focus:border-white"
          />
          <input
            type="password"
            required
            placeholder="senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3 outline-none focus:border-white"
          />
          <button
            disabled={loading}
            className="bg-white text-black rounded-lg py-3 font-medium disabled:opacity-50"
          >
            {loading ? "..." : "entrar / criar conta"}
          </button>
        </form>

        <div className="my-6 text-center text-neutral-600 text-xs">ou</div>

        <button
          onClick={google}
          className="w-full border border-neutral-800 rounded-lg py-3 hover:border-neutral-600"
        >
          continuar com Google
        </button>

        {error && <p className="text-red-400 text-sm mt-4 text-center">{error}</p>}
      </div>
    </main>
  );
}
