"use client";
import { useState } from "react";

// Formulário simples de e-mail. POSTa para /api/lead.
export default function EmailCapture({ artist }: { artist: string | null }) {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, artist }),
      });
      if (res.ok) setDone(true);
    } finally {
      setLoading(false);
    }
  }

  if (done)
    return (
      <p className="text-center text-neutral-400 mt-12">
        Pronto. Você está na lista do Bubble. ✨
      </p>
    );

  return (
    <form onSubmit={submit} className="mt-16 max-w-md mx-auto text-center">
      <p className="text-neutral-300 mb-4">Quer descobrir mais? Entre na lista do Bubble.</p>
      <div className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="seu@email.com"
          className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3 outline-none focus:border-white"
        />
        <button
          disabled={loading}
          className="bg-white text-black px-5 py-3 rounded-lg font-medium disabled:opacity-50"
        >
          Entrar
        </button>
      </div>
    </form>
  );
}
