# Bubble Mobile 

App mobile (Expo / React Native) que recomenda cultura conectada pelo seu gosto.
Você digita uma vibe, um artista ou um humor e recebe um pack com um **filme**,
um livro, uma música e um lugar ligados por aquela vibe — cada item com
uma frase explicando a conexão. Usa **localização + clima** para calibrar a
recomendação, deixa salvar packs no histórico, compartilhar pelo recurso
nativo do celular e manda uma recomendação do dia por notificação.

## Problema

Descobrir cultura é fragmentado: música num app, filme em outro, livro em outro.
Essa separação gera paralisia de escolha. O Bubble conecta os domínios pelo gosto,
num pacote só, no celular, no momento em que a vontade bate.

## Funcionalidades 
| Requisito | Como é atendido |
|---|---|
| **Mobile nativo** | Expo / React Native + TypeScript (compila para iOS/Android nativo). |
| **Múltiplas telas + navegação** | `expo-router`: Login, Descobrir, Pack, Histórico, Perfil. |
| **Backend** | Bubble (Next.js API) — pipeline de recomendação por embeddings. |
| **Banco de dados** | Supabase (Postgres + pgvector): catálogo e `bubble_packs`. |
| **API externa** | TMDB, Google Books, Spotify, Groq (LLM), Gemini (embeddings), OpenWeather. |
| **Notificações** | `expo-notifications`: "recomendação do dia" local, diária e com o clima. |
| **Compartilhamento** | `Share` nativo do React Native (texto do pack). |
| **Hardware** | **GPS** (`expo-location`) → clima → calibra a vibe. **Biometria** (`expo-local-authentication`) para desbloqueio (bônus). |
| **Erros / loading** | Estados de loading, vazio e erro em todas as telas; timeout nas chamadas. |

## Vídeo Demo

> [Link para o vídeo](https://drive.google.com/drive/folders/1y5s-s3N4Vu4VaTGPw_yGQtFhyWUAvE4l?usp=sharing)

## Arquitetura

Mono-repo: o app (`mobile/`) e o backend (`backend/`) vivem no **mesmo
repositório**. O backend é deployado na Vercel; o app consome a URL pública.

```
mobile/ (Expo RN+TS) ──HTTP──> backend/ (Next.js, Vercel) ──> Supabase (pgvector)
   │                              /api/pack  /api/weather       Groq · Gemini · TMDB
   └──SDK direto──> Supabase (auth + bubble_packs, via RLS)      Books · Spotify · OpenWeather
```

- **Recomendação:** `POST /api/pack` (JSON). O contexto de clima é injetado no
  `mood` enviado ao backend, a partir do GPS + `GET /api/weather`.
- **Auth e histórico:** falam **direto** com o Supabase pelo SDK (sessão
  persistida em `AsyncStorage`), pois as rotas do backend usam cookie.
- **Seam único de rede:** toda I/O externa fica em `mobile/lib/` (`api.ts`,
  `supabase.ts`, `packs.ts`).

## Estrutura

```
app-recomendacoes/
  backend/                 # API Next.js (deploy na Vercel) — pipeline de recomendação
  mobile/                  # app Expo / React Native
```

```
mobile/
  app/
    _layout.tsx            # AuthProvider, guard de rota, biometria, notificação→rota
    login.tsx              # login/cadastro (Supabase)
    pack.tsx               # resultado: cards + salvar + compartilhar
    (tabs)/
      index.tsx            # Descobrir: busca de vibe + badge de clima
      history.tsx          # histórico de packs salvos
      profile.tsx          # conta, toggle de notificação e de biometria, logout
  components/              # PackItemCard, WeatherBadge, BiometricGate
  lib/                     # api, supabase, auth, packs, useWeather, notifications, biometrics, share
  store/                   # estado em memória (pack atual, último clima)
  constants/theme.ts       # identidade visual do Bubble
```

## Como rodar

Pré-requisitos: Node 18+, app **Expo Go** no celular, PC e celular na **mesma rede**.

### 1. Backend

```bash
cd backend
npm install
npm run dev              # sobe em http://localhost:3000
```

> O backend precisa do `backend/.env.local` preenchido (chaves de Groq, Gemini,
> Supabase, TMDB, etc. — veja `.env.local.example`). Rode em **Node 20** (igual à
> Vercel): o `groq-sdk` 0.7.0 tem incompatibilidade de gzip com Node 24.
>
> Em produção o backend roda na **Vercel** (root directory = `backend/`), com as
> mesmas variáveis configuradas no painel da Vercel.

### 2. App (mobile)

```bash
cd mobile
npm install
cp .env.example .env     # e preencha os valores
npx expo start
```

No `.env`:

```
EXPO_PUBLIC_API_BASE=http://SEU_IP_LAN:3000   # ex.: ipconfig getifaddr en0
EXPO_PUBLIC_SUPABASE_URL=...                   # copie do bubble/.env.local
EXPO_PUBLIC_SUPABASE_ANON_KEY=...              # copie do bubble/.env.local
```

Abra o QR no **Expo Go**.

### 3. Supabase (uma vez)

Garanta a tabela de histórico com RLS (SQL Editor do Supabase):

```sql
create table if not exists bubble_packs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text, mood_input text, items jsonb,
  created_at timestamptz default now()
);
alter table bubble_packs enable row level security;
create policy "own packs select" on bubble_packs for select using (auth.uid() = user_id);
create policy "own packs insert" on bubble_packs for insert with check (auth.uid() = user_id);
```

Para testar rápido, em **Authentication → Providers → Email**, desative
"Confirm email".

## Gerar o APK (instalável)

O app é distribuído como **APK** via **EAS Build** (build na nuvem da Expo).

```bash
cd mobile
npm i -g eas-cli
eas login                       # conta Expo (gratuita)
# Em eas.json → build.preview.env.EXPO_PUBLIC_API_BASE, coloque a URL da Vercel
eas build -p android --profile preview
```

Ao final, o EAS fornece um link para baixar o `.apk`. No Android, habilite
"instalar de fontes desconhecidas" e instale.

> O perfil `preview` gera **APK** (`buildType: apk`), instalável direto — ao
> contrário do `production`, que gera `.aab` para a Play Store.

## Stack

Expo (React Native + TypeScript), expo-router, Supabase JS SDK, expo-location,
expo-notifications, expo-local-authentication. Backend: Next.js 14 na Vercel +
Supabase (pgvector).
