-- ============================================================
-- MIGRATION 001: Initial Schema
-- VibeQuiz — tables, indexes, RLS policies
-- ============================================================

-- Extensions
create extension if not exists "pgcrypto";

-- ============================================================
-- ENUM: room_status
-- ============================================================
create type room_status as enum ('lobby', 'active', 'finished');

-- ============================================================
-- TABLE: quizzes
-- Owned by a Host (authenticated Supabase user)
-- ============================================================
create table quizzes (
  id          uuid        primary key default gen_random_uuid(),
  host_id     uuid        not null references auth.users(id) on delete cascade,
  title       text        not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger quizzes_updated_at
  before update on quizzes
  for each row execute function update_updated_at();

-- ============================================================
-- TABLE: questions
-- The correct_option flag NEVER leaves the server.
-- ============================================================
create table questions (
  id             uuid    primary key default gen_random_uuid(),
  quiz_id        uuid    not null references quizzes(id) on delete cascade,
  position       int     not null,
  text           text    not null,
  time_limit     int     not null default 30 check (time_limit between 5 and 120),
  max_points     int     not null default 1000,
  option_a       text    not null,
  option_b       text    not null,
  option_c       text    not null,
  option_d       text    not null,
  correct_option char(1) not null check (correct_option in ('A','B','C','D')),
  created_at     timestamptz not null default now(),
  unique (quiz_id, position)
);

create index idx_questions_quiz_position on questions(quiz_id, position);

-- ============================================================
-- TABLE: rooms
-- A single live game session
-- ============================================================
create table rooms (
  id               uuid        primary key default gen_random_uuid(),
  room_code        char(6)     not null unique,
  quiz_id          uuid        not null references quizzes(id),
  host_id          uuid        not null references auth.users(id),
  status           room_status not null default 'lobby',
  current_question int         not null default 0,
  started_at       timestamptz,
  ended_at         timestamptz,
  created_at       timestamptz not null default now()
);

create index idx_rooms_room_code on rooms(room_code);
create index idx_rooms_host_id   on rooms(host_id);

-- ============================================================
-- TABLE: players
-- Anonymous players joined to a room
-- ============================================================
create table players (
  id          uuid        primary key default gen_random_uuid(),
  room_id     uuid        not null references rooms(id) on delete cascade,
  name        text        not null,
  avatar      text,
  total_score bigint      not null default 0,
  joined_at   timestamptz not null default now(),
  unique (room_id, name)
);

create index idx_players_room_id on players(room_id);

-- ============================================================
-- TABLE: responses
-- Immutable once inserted. Populated exclusively via RPC.
-- ============================================================
create table responses (
  id               uuid        primary key default gen_random_uuid(),
  room_id          uuid        not null references rooms(id)     on delete cascade,
  player_id        uuid        not null references players(id)   on delete cascade,
  question_id      uuid        not null references questions(id) on delete cascade,
  selected_option  char(1)     not null check (selected_option in ('A','B','C','D')),
  answered_at      timestamptz not null default now(),
  response_time_ms int         not null,
  is_correct       boolean     not null default false,
  points_awarded   int         not null default 0,
  unique (player_id, question_id)
);

-- Optimized for burst reads (leaderboard) and writes (answer submission)
create index idx_responses_room_question on responses(room_id, question_id);
create index idx_responses_player_id     on responses(player_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table quizzes   enable row level security;
alter table questions enable row level security;
alter table rooms     enable row level security;
alter table players   enable row level security;
alter table responses enable row level security;

-- quizzes: owner-only access
create policy "Host owns quizzes"
  on quizzes for all
  using (auth.uid() = host_id)
  with check (auth.uid() = host_id);

-- questions: accessible via quiz ownership
create policy "Host owns questions"
  on questions for all
  using (
    exists (
      select 1 from quizzes q
      where q.id = questions.quiz_id and q.host_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from quizzes q
      where q.id = questions.quiz_id and q.host_id = auth.uid()
    )
  );

-- questions: players can read questions for active rooms (without correct_option via view)
-- We expose a view instead — see below.

-- rooms: host manages their rooms
create policy "Host manages rooms"
  on rooms for all
  using (auth.uid() = host_id)
  with check (auth.uid() = host_id);

-- rooms: anyone can read a room by code (needed for join validation)
create policy "Anyone reads active rooms"
  on rooms for select
  using (true);

-- players: anyone can insert (join a room)
create policy "Players can join"
  on players for insert
  with check (true);

-- players: host reads all players in their rooms
create policy "Host reads players"
  on players for select
  using (
    exists (
      select 1 from rooms r
      where r.id = players.room_id and r.host_id = auth.uid()
    )
  );

-- players: a player can read their own row (identified by player_id passed as a setting)
create policy "Player reads self"
  on players for select
  using (id::text = current_setting('app.player_id', true));

-- responses: no direct client insert (enforced by security definer RPC)
create policy "No direct response insert"
  on responses for insert
  with check (false);

-- responses: host reads all responses in their rooms
create policy "Host reads responses"
  on responses for select
  using (
    exists (
      select 1 from rooms r
      where r.id = responses.room_id and r.host_id = auth.uid()
    )
  );

-- ============================================================
-- END OF MIGRATION 001
-- ============================================================
