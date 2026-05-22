-- ============================================================
-- MIGRATION 002: RPC Functions
-- VibeQuiz — secure answer submission + room management
-- ============================================================

-- ============================================================
-- FUNCTION: generate_room_code
-- Generates a unique 6-digit numeric room code
-- ============================================================
create or replace function generate_room_code()
returns char(6)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code char(6);
  v_exists boolean;
begin
  loop
    -- Generate 6-digit numeric code (100000–999999)
    v_code := lpad((floor(random() * 900000 + 100000)::int)::text, 6, '0');
    select exists(select 1 from rooms where room_code = v_code and status != 'finished')
    into v_exists;
    exit when not v_exists;
  end loop;
  return v_code;
end;
$$;

-- ============================================================
-- FUNCTION: create_room
-- Host creates a new game room for a quiz
-- ============================================================
create or replace function create_room(p_quiz_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host_id  uuid := auth.uid();
  v_code     char(6);
  v_room_id  uuid;
begin
  -- Validate host owns this quiz
  if not exists (select 1 from quizzes where id = p_quiz_id and host_id = v_host_id) then
    return jsonb_build_object('success', false, 'error', 'QUIZ_NOT_FOUND');
  end if;

  -- Close any existing active rooms for this host (one game at a time)
  update rooms
  set status = 'finished', ended_at = now()
  where host_id = v_host_id and status in ('lobby', 'active');

  v_code := generate_room_code();

  insert into rooms (room_code, quiz_id, host_id, status)
  values (v_code, p_quiz_id, v_host_id, 'lobby')
  returning id into v_room_id;

  return jsonb_build_object(
    'success',   true,
    'room_id',   v_room_id,
    'room_code', v_code
  );
end;
$$;

revoke execute on function create_room(uuid) from public;
grant execute on function create_room(uuid) to authenticated;

-- ============================================================
-- FUNCTION: join_room
-- Anonymous player joins a room by code
-- ============================================================
create or replace function join_room(
  p_room_code char(6),
  p_name      text,
  p_avatar    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room      rooms%rowtype;
  v_player_id uuid;
begin
  -- Validate room exists and is in lobby/active state
  select * into v_room
  from rooms
  where room_code = p_room_code and status = 'lobby';

  if not found then
    return jsonb_build_object('success', false, 'error', 'ROOM_NOT_FOUND_OR_STARTED');
  end if;

  -- Validate name
  if length(trim(p_name)) < 1 or length(p_name) > 30 then
    return jsonb_build_object('success', false, 'error', 'INVALID_NAME');
  end if;

  -- Upsert player (allow re-joining with same name after refresh)
  insert into players (room_id, name, avatar)
  values (v_room.id, trim(p_name), p_avatar)
  on conflict (room_id, name) do update
    set avatar = excluded.avatar
  returning id into v_player_id;

  return jsonb_build_object(
    'success',   true,
    'player_id', v_player_id,
    'room_id',   v_room.id,
    'room_code', p_room_code
  );
end;
$$;

revoke execute on function join_room(char(6), text, text) from public;
grant execute on function join_room(char(6), text, text) to anon;

-- ============================================================
-- FUNCTION: start_game
-- Host starts the game (transitions lobby → active)
-- ============================================================
create or replace function start_game(p_room_code char(6))
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms%rowtype;
begin
  select * into v_room
  from rooms
  where room_code = p_room_code and host_id = auth.uid() and status = 'lobby';

  if not found then
    return jsonb_build_object('success', false, 'error', 'ROOM_NOT_FOUND_OR_NOT_LOBBY');
  end if;

  -- Check quiz has at least 1 question
  if not exists (select 1 from questions where quiz_id = v_room.quiz_id) then
    return jsonb_build_object('success', false, 'error', 'QUIZ_HAS_NO_QUESTIONS');
  end if;

  update rooms
  set status = 'active', started_at = now(), current_question = 1
  where id = v_room.id;

  return jsonb_build_object('success', true);
end;
$$;

revoke execute on function start_game(char(6)) from public;
grant execute on function start_game(char(6)) to authenticated;

-- ============================================================
-- FUNCTION: advance_question
-- Host advances to the next question
-- ============================================================
create or replace function advance_question(p_room_code char(6))
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room          rooms%rowtype;
  v_total_q       int;
  v_next          int;
begin
  select * into v_room
  from rooms
  where room_code = p_room_code and host_id = auth.uid() and status = 'active';

  if not found then
    return jsonb_build_object('success', false, 'error', 'ROOM_NOT_ACTIVE');
  end if;

  select count(*) into v_total_q
  from questions where quiz_id = v_room.quiz_id;

  v_next := v_room.current_question + 1;

  if v_next > v_total_q then
    return jsonb_build_object('success', false, 'error', 'NO_MORE_QUESTIONS', 'total', v_total_q);
  end if;

  update rooms set current_question = v_next where id = v_room.id;

  return jsonb_build_object('success', true, 'question_index', v_next, 'total', v_total_q);
end;
$$;

revoke execute on function advance_question(char(6)) from public;
grant execute on function advance_question(char(6)) to authenticated;

-- ============================================================
-- FUNCTION: submit_answer
-- Secure, high-concurrency answer submission (security definer)
-- Handles: state validation, idempotency, scoring, accumulation
-- ============================================================
create or replace function submit_answer(
  p_room_code       char(6),
  p_player_id       uuid,
  p_question_id     uuid,
  p_selected_option char(1),
  p_response_time_ms int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room          rooms%rowtype;
  v_question      questions%rowtype;
  v_is_correct    boolean;
  v_points        int := 0;
  v_time_fraction numeric;
  v_inserted      int;
begin
  -- 1. Validate room is active (shared lock to allow concurrent reads)
  select * into v_room
  from rooms
  where room_code = p_room_code and status = 'active'
  for share;

  if not found then
    return jsonb_build_object('success', false, 'error', 'ROOM_NOT_ACTIVE');
  end if;

  -- 2. Validate question belongs to current quiz AND is the current question
  select * into v_question
  from questions
  where id = p_question_id
    and quiz_id = v_room.quiz_id
    and position = v_room.current_question;

  if not found then
    return jsonb_build_object('success', false, 'error', 'INVALID_QUESTION');
  end if;

  -- 3. Validate player belongs to this room
  if not exists (
    select 1 from players
    where id = p_player_id and room_id = v_room.id
  ) then
    return jsonb_build_object('success', false, 'error', 'PLAYER_NOT_IN_ROOM');
  end if;

  -- 4. Validate input option
  if p_selected_option not in ('A','B','C','D') then
    return jsonb_build_object('success', false, 'error', 'INVALID_OPTION');
  end if;

  -- 5. Validate response time is within the allowed window
  if p_response_time_ms < 0 or p_response_time_ms > (v_question.time_limit * 1000 + 500) then
    return jsonb_build_object('success', false, 'error', 'INVALID_RESPONSE_TIME');
  end if;

  -- 6. Check correctness (answer key never sent to client — only computed here)
  v_is_correct := (p_selected_option = v_question.correct_option);

  -- 7. Time-decayed scoring (Kahoot-style)
  --    Points = max_points * (1 - 0.5 * (time_used / time_limit))
  --    Minimum for a correct answer: max_points / 2
  if v_is_correct then
    v_time_fraction := least(
      p_response_time_ms::numeric / (v_question.time_limit * 1000),
      1.0
    );
    v_points := greatest(
      (v_question.max_points * (1.0 - 0.5 * v_time_fraction))::int,
      v_question.max_points / 2
    );
  end if;

  -- 8. Atomic insert with conflict handling (idempotency + race condition safety)
  insert into responses (
    room_id, player_id, question_id,
    selected_option, response_time_ms,
    is_correct, points_awarded
  )
  values (
    v_room.id, p_player_id, p_question_id,
    p_selected_option, p_response_time_ms,
    v_is_correct, v_points
  )
  on conflict (player_id, question_id) do nothing;

  get diagnostics v_inserted = row_count;

  -- 9. Update player total score only if this was a new insertion
  if v_inserted > 0 and v_points > 0 then
    update players
    set total_score = total_score + v_points
    where id = p_player_id;
  end if;

  return jsonb_build_object(
    'success',    true,
    'is_correct', v_is_correct,
    'points',     v_points,
    'duplicate',  (v_inserted = 0)
  );
end;
$$;

-- Grant to anon: players are unauthenticated
revoke execute on function submit_answer(char(6), uuid, uuid, char(1), int) from public;
grant execute on function submit_answer(char(6), uuid, uuid, char(1), int) to anon;

-- ============================================================
-- FUNCTION: end_game
-- Host explicitly ends the game
-- ============================================================
create or replace function end_game(p_room_code char(6))
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update rooms
  set status = 'finished', ended_at = now()
  where room_code = p_room_code and host_id = auth.uid() and status = 'active';

  if not found then
    return jsonb_build_object('success', false, 'error', 'ROOM_NOT_FOUND');
  end if;

  return jsonb_build_object('success', true);
end;
$$;

revoke execute on function end_game(char(6)) from public;
grant execute on function end_game(char(6)) to authenticated;

-- ============================================================
-- FUNCTION: get_leaderboard
-- Returns top N players for a room ordered by score
-- Safe to call from both host and player clients
-- ============================================================
create or replace function get_leaderboard(p_room_code char(6), p_limit int default 10)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
  v_result  jsonb;
begin
  select id into v_room_id from rooms where room_code = p_room_code;

  if not found then
    return jsonb_build_object('success', false, 'error', 'ROOM_NOT_FOUND');
  end if;

  select jsonb_agg(row_to_json(t))
  into v_result
  from (
    select
      name,
      avatar,
      total_score,
      rank() over (order by total_score desc) as rank
    from players
    where room_id = v_room_id
    order by total_score desc
    limit p_limit
  ) t;

  return jsonb_build_object('success', true, 'players', coalesce(v_result, '[]'::jsonb));
end;
$$;

revoke execute on function get_leaderboard(char(6), int) from public;
grant execute on function get_leaderboard(char(6), int) to anon, authenticated;

-- ============================================================
-- FUNCTION: get_question_results
-- Returns answer distribution for a question (for host view)
-- ============================================================
create or replace function get_question_results(
  p_room_code   char(6),
  p_question_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room     rooms%rowtype;
  v_question questions%rowtype;
  v_result   jsonb;
begin
  select * into v_room
  from rooms
  where room_code = p_room_code and host_id = auth.uid();

  if not found then
    return jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
  end if;

  select * into v_question
  from questions
  where id = p_question_id and quiz_id = v_room.quiz_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'QUESTION_NOT_FOUND');
  end if;

  select jsonb_build_object(
    'correct_option',  v_question.correct_option,
    'total_responses', count(*),
    'correct_count',   count(*) filter (where is_correct),
    'distribution', jsonb_build_object(
      'A', count(*) filter (where selected_option = 'A'),
      'B', count(*) filter (where selected_option = 'B'),
      'C', count(*) filter (where selected_option = 'C'),
      'D', count(*) filter (where selected_option = 'D')
    )
  )
  into v_result
  from responses
  where room_id = v_room.id and question_id = p_question_id;

  return jsonb_build_object('success', true, 'results', v_result);
end;
$$;

revoke execute on function get_question_results(char(6), uuid) from public;
grant execute on function get_question_results(char(6), uuid) to authenticated;
