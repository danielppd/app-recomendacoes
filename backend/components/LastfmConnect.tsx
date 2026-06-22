"use client";
import { useState } from "react";

type Props = {
  initialUsername?: string | null;
};

export default function LastfmConnect({ initialUsername }: Props) {
  const [username, setUsername] = useState(initialUsername ?? "");
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(!!initialUsername);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(
    initialUsername ? { ok: true, msg: "Conta conectada." } : null
  );

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/lastfm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setConnected(true);
      setStatus({
        ok: true,
        msg: `${data.artistCount} artistas importados${data.mergedWithSpotify ? " (mesclado com Spotify)" : ""}.`,
      });
    } catch (e: any) {
      setStatus({ ok: false, msg: e.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`border rounded-xl p-5 ${connected ? "border-green-800/50" : "border-neutral-800"}`}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-medium">Last.fm</h3>
        {connected && (
          <span className="text-[10px] text-green-400 flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400" />
            conectado
          </span>
        )}
      </div>
      <p className="text-xs text-neutral-500 mb-3">
        {connected
          ? "Seu histórico de scrobbling está integrado ao perfil."
          : "Conecte seu Last.fm para enriquecer seu perfil de vibe com histórico de scrobbling."}
      </p>
      <form onSubmit={handleConnect} className="flex gap-2">
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Seu username"
          disabled={loading || connected}
          className={`flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm outline-none transition ${connected ? "opacity-60" : "focus:border-neutral-500"}`}
        />
        {connected ? (
          <button
            type="button"
            onClick={() => { setConnected(false); setStatus(null); }}
            className="px-4 py-2 rounded-lg border border-neutral-700 text-sm text-neutral-500 hover:text-white hover:border-neutral-500 transition"
          >
            reconectar
          </button>
        ) : (
          <button
            type="submit"
            disabled={loading || !username.trim()}
            className="px-4 py-2 rounded-lg border border-neutral-700 text-sm hover:bg-white hover:text-black transition disabled:opacity-30"
          >
            {loading ? "..." : "conectar"}
          </button>
        )}
      </form>
      {!connected && (
        <p className="text-[10px] text-neutral-600 mt-2">
          Seu username está em{" "}
          <span className="text-neutral-400">last.fm/user/SEU_USERNAME</span>
        </p>
      )}
      {status && (
        <p className={`text-xs mt-2 ${status.ok ? "text-green-400" : "text-red-400"}`}>
          {status.msg}
        </p>
      )}
    </div>
  );
}
