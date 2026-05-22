# VibeQuiz 🎮

A self-hosted, real-time multiplayer quiz app for up to 300 concurrent players. Built with Next.js 15 + Supabase.

## Tech Stack

- **Frontend:** Next.js 15 (App Router) + TypeScript + Tailwind CSS
- **Realtime:** Supabase Realtime (Broadcast + Presence)
- **Database:** Supabase PostgreSQL with Row Level Security
- **Auth:** Supabase Auth (Magic Link — Hosts only)
- **Hosting:** Vercel (frontend) + Supabase Free Tier (backend)

## Features

- 🔒 **Anti-cheat**: Answer keys never leave the server. All scoring via PostgreSQL RPC.
- ⚡ **Sub-100ms delivery**: Supabase Broadcast pushes questions to 300 players instantly.
- 🏆 **Time-decayed scoring**: Faster correct answers earn more points (Kahoot-style).
- 🔄 **Session persistence**: Players survive browser refreshes via localStorage.
- 📊 **Per-question results**: Answer distribution shown to host after each question.

## Setup

### 1. Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) account (free tier works)

### 2. Clone & Install
```bash
git clone <repo>
cd VibeQuiz
npm install
```

### 3. Configure Environment
```bash
cp .env.local.example .env.local
# Fill in your Supabase URL and Anon Key
```

### 4. Run Database Migrations
In your Supabase Dashboard → SQL Editor, run in order:
1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_rpc_functions.sql`

### 5. Enable Supabase Realtime
In Supabase Dashboard → Database → Replication:
- Enable `rooms` table
- Enable `players` table

### 6. Configure Supabase Auth
In Supabase Dashboard → Auth → Providers:
- Enable **Email** provider
- Set Site URL to `http://localhost:3000` (dev) or your Vercel URL (prod)
- Add redirect URL: `https://your-domain.com/auth/callback`

### 7. Run Locally
```bash
npm run dev
# Open http://localhost:3000
```

## Game Flow

```
Host logs in → Creates a quiz → Clicks "Host"
  → Room created (6-digit code) → Lobby opens
  → Players join at /play with the code
  → Host clicks "Start Game"
  → Questions broadcast via Supabase Realtime
  → Players submit answers via secure RPC
  → Leaderboard shown after each question
  → Host clicks "End Game" → Final results
```

## Security Architecture

- `correct_option` is stored in PostgreSQL and **never** included in Realtime broadcasts or client queries
- Players write answers via `submit_answer` RPC (`SECURITY DEFINER`) — direct table inserts are blocked by RLS
- Response time is validated server-side (max = question time limit + 500ms buffer)
- Duplicate answer submissions are silently ignored via `ON CONFLICT DO NOTHING`

## Project Structure

```
app/
  page.tsx              # Landing page
  login/                # Host auth (magic link)
  auth/callback/        # OAuth callback
  host/                 # Protected host area
    dashboard/          # Quiz library
    quiz/[id]/
      edit/             # Quiz builder
      lobby/            # Live game control
  play/                 # Player join + game

components/
  host/QuizBuilder.tsx  # Quiz CRUD editor
  host/HostGame.tsx     # Host game control panel
  player/JoinForm.tsx   # Room code + name + avatar
  player/PlayerGame.tsx # Player game screen

hooks/
  useHostChannel.ts     # Broadcast sender
  usePlayerChannel.ts   # Broadcast receiver
  usePresence.ts        # Lobby presence list

lib/
  supabase/             # Client/server Supabase clients
  types.ts              # Shared TypeScript types
  session.ts            # localStorage session helpers

supabase/migrations/
  001_initial_schema.sql  # Tables, indexes, RLS
  002_rpc_functions.sql   # All game RPCs
```

## Deploying to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Add environment variables in Vercel Dashboard:
# NEXT_PUBLIC_SUPABASE_URL
# NEXT_PUBLIC_SUPABASE_ANON_KEY
```
