"use client";
import { useState, useRef } from "react";

type Props = {
  alreadyImported?: boolean;
};

export default function GoodreadsImport({ alreadyImported }: Props) {
  const [loading, setLoading] = useState(false);
  const [imported, setImported] = useState(!!alreadyImported);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(
    alreadyImported ? { ok: true, msg: "Biblioteca importada." } : null
  );
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setLoading(true);
    setStatus(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/goodreads", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setImported(true);
      setStatus({
        ok: true,
        msg: `${data.imported} livros importados, ${data.matched} encontrados no catálogo do Bubble.`,
      });
    } catch (e: any) {
      setStatus({ ok: false, msg: e.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`border rounded-xl p-5 ${imported ? "border-green-800/50" : "border-neutral-800"}`}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-medium">Goodreads</h3>
        {imported && (
          <span className="text-[10px] text-green-400 flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400" />
            importado
          </span>
        )}
      </div>
      <p className="text-xs text-neutral-500 mb-3">
        {imported
          ? "Sua biblioteca está integrada às recomendações de livros."
          : "Importe sua biblioteca para enriquecer recomendações de livros."}
      </p>

      {!imported && (
        <ol className="text-[10px] text-neutral-500 mb-4 space-y-0.5 list-decimal list-inside">
          <li>Acesse goodreads.com → My Books → Import and Export</li>
          <li>Clique em &quot;Export Library&quot;</li>
          <li>Aguarde o email e baixe o arquivo CSV</li>
          <li>Faça o upload abaixo</li>
        </ol>
      )}

      {imported ? (
        <button
          type="button"
          onClick={() => { setImported(false); setStatus(null); }}
          className="px-4 py-2 rounded-lg border border-neutral-700 text-sm text-neutral-500 hover:text-white hover:border-neutral-500 transition"
        >
          reimportar
        </button>
      ) : (
        <form onSubmit={handleUpload} className="flex gap-2 items-center">
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            disabled={loading}
            className="flex-1 text-sm text-neutral-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border file:border-neutral-700 file:text-sm file:bg-transparent file:text-neutral-300 file:cursor-pointer hover:file:border-neutral-500 file:transition"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 rounded-lg border border-neutral-700 text-sm hover:bg-white hover:text-black transition disabled:opacity-30"
          >
            {loading ? "importando..." : "importar"}
          </button>
        </form>
      )}

      {status && (
        <p className={`text-xs mt-3 ${status.ok ? "text-green-400" : "text-red-400"}`}>
          {status.msg}
        </p>
      )}
    </div>
  );
}
