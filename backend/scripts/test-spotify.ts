/**
 * Diagnóstico do Spotify API: pega token via Client Credentials,
 * faz 3 chamadas mínimas, imprime resposta completa.
 *
 * Uso: npx tsx scripts/test-spotify.ts
 */
import "dotenv/config";

const ACCOUNTS = "https://accounts.spotify.com";
const API = "https://api.spotify.com/v1";

async function main() {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) {
    console.error("Falta SPOTIFY_CLIENT_ID/SECRET no .env");
    process.exit(1);
  }

  // ---- 1. Token ----
  console.log("--- 1. Token (Client Credentials) ---");
  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const tokenRes = await fetch(`${ACCOUNTS}/api/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  console.log(`Status: ${tokenRes.status}`);
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok) {
    console.error("Token failed:", tokenJson);
    process.exit(1);
  }
  const token = tokenJson.access_token;
  console.log(`  access_token: ${token.slice(0, 30)}... (${token.length} chars)`);
  console.log(`  token_type: ${tokenJson.token_type}`);
  console.log(`  expires_in: ${tokenJson.expires_in}s`);
  console.log(`  scope: ${tokenJson.scope ?? "(none)"}\n`);

  // ---- 2. Teste 1: /search simples ----
  console.log("--- 2. /search?q=rock&type=artist&limit=5 ---");
  const search1 = await fetch(
    `${API}/search?q=rock&type=artist&limit=5`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  console.log(`Status: ${search1.status}`);
  console.log(`Body: ${(await search1.text()).slice(0, 800)}\n`);

  // ---- 3. Teste 2: /search com genre: ----
  console.log('--- 3. /search?q=genre:rock&type=artist&limit=5 ---');
  const search2 = await fetch(
    `${API}/search?q=${encodeURIComponent("genre:rock")}&type=artist&limit=5`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  console.log(`Status: ${search2.status}`);
  console.log(`Body: ${(await search2.text()).slice(0, 800)}\n`);

  // ---- 4. Teste 3: /artists/{id} - endpoint canônico de artista (Radiohead) ----
  console.log("--- 4. /artists/4Z8W4fKeB5YxbusRsdQVPb (Radiohead) ---");
  const artist = await fetch(
    `${API}/artists/4Z8W4fKeB5YxbusRsdQVPb`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  console.log(`Status: ${artist.status}`);
  console.log(`Body: ${(await artist.text()).slice(0, 400)}\n`);

  // ---- 5. Teste 4: descobre qual limit o /search aceita hoje ----
  console.log("--- 5. Varredura de valores de `limit` em /search ---");
  for (const lim of [5, 10, 15, 20, 25, 30, 40, 50]) {
    const res = await fetch(
      `${API}/search?q=rock&type=artist&limit=${lim}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const ok = res.ok;
    let suffix = "";
    if (!ok) {
      const body = (await res.text()).slice(0, 200);
      suffix = ` — ${body}`;
    } else {
      const json = await res.json();
      suffix = ` — ${json.artists?.items?.length ?? 0} artistas retornados`;
    }
    console.log(`  limit=${lim}: ${res.status}${suffix}`);
  }
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
