-- ============================================================
-- UNIT & INTEGRATION TEST: VibeQuiz Database Functions
-- ============================================================
-- This test runs inside a transaction block that automatically
-- rolls back at the end, keeping your database 100% clean.
--
-- You can run this in your Supabase SQL Editor.
-- ============================================================

begin;

do $$
declare
  -- Define test constants
  v_host_id      uuid := 'd3b07384-d113-4956-a5cc-484c0f862300'::uuid;
  v_quiz_id      uuid;
  v_question_id  uuid;
  v_room_code    char(6);
  v_room_id      uuid;
  v_player_a_id  uuid;
  v_player_b_id  uuid;
  v_res          jsonb;
  v_score_a      bigint;
  v_score_b      bigint;
begin
  -- 1. Mock authenticated Host user (assigning v_host_id to auth.uid())
  perform set_config('request.jwt.claims', json_build_object('sub', v_host_id)::text, true);
  raise notice '1. Mocked host authentication to ID: %', v_host_id;

  -- 2. Setup mock data: Quiz owned by Host
  insert into quizzes (host_id, title, description)
  values (v_host_id, 'Integration Test Quiz', 'Testing full database flow')
  returning id into v_quiz_id;
  raise notice '2. Created mock quiz with ID: %', v_quiz_id;

  -- 3. Setup mock data: Question with correct answer B
  insert into questions (
    quiz_id, position, text, time_limit, max_points,
    option_a, option_b, option_c, option_d, correct_option
  )
  values (
    v_quiz_id, 1, 'What is 2 + 2?', 10, 1000,
    '3', '4', '5', '6', 'B'
  )
  returning id into v_question_id;
  raise notice '3. Created mock question with ID: %', v_question_id;

  -- 4. Test: generate_room_code()
  v_room_code := generate_room_code();
  if v_room_code is null or length(v_room_code) != 6 then
    raise exception '❌ TEST FAILED: generate_room_code returned invalid code: %', v_room_code;
  end if;
  raise notice '4. generate_room_code() passed. Generated: %', v_room_code;

  -- 5. Test: create_room()
  v_res := create_room(v_quiz_id);
  if not (v_res->>'success')::boolean then
    raise exception '❌ TEST FAILED: create_room failed with error: %', v_res->>'error';
  end if;
  v_room_id := (v_res->>'room_id')::uuid;
  v_room_code := v_res->>'room_code';
  raise notice '5. create_room() passed. Room ID: %, Room Code: %', v_room_id, v_room_code;

  -- 6. Test: join_room() for Player A (Alice)
  v_res := join_room(v_room_code, 'Alice', '🐱');
  if not (v_res->>'success')::boolean then
    raise exception '❌ TEST FAILED: join_room for Alice failed with error: %', v_res->>'error';
  end if;
  v_player_a_id := (v_res->>'player_id')::uuid;
  raise notice '6. join_room() Alice passed. Player ID: %', v_player_a_id;

  -- 7. Test: join_room() for Player B (Bob)
  v_res := join_room(v_room_code, 'Bob', '🐶');
  if not (v_res->>'success')::boolean then
    raise exception '❌ TEST FAILED: join_room for Bob failed with error: %', v_res->>'error';
  end if;
  v_player_b_id := (v_res->>'player_id')::uuid;
  raise notice '7. join_room() Bob passed. Player ID: %', v_player_b_id;

  -- 8. Test: start_game()
  v_res := start_game(v_room_code);
  if not (v_res->>'success')::boolean then
    raise exception '❌ TEST FAILED: start_game failed with error: %', v_res->>'error';
  end if;
  if not exists (select 1 from rooms where id = v_room_id and status = 'active' and current_question = 1) then
    raise exception '❌ TEST FAILED: start_game succeeded but room status or current_question was not updated correctly';
  end if;
  raise notice '8. start_game() passed. Room is now active at question 1.';

  -- 9. Test: submit_answer() Alice (correct answer: B, response time: 2s)
  v_res := submit_answer(v_room_code, v_player_a_id, v_question_id, 'B', 2000);
  if not (v_res->>'success')::boolean then
    raise exception '❌ TEST FAILED: submit_answer for Alice failed: %', v_res->>'error';
  end if;
  if not (v_res->>'is_correct')::boolean or (v_res->>'points')::int <= 0 then
    raise exception '❌ TEST FAILED: submit_answer correct calculation failed: %', v_res;
  end if;
  raise notice '9. submit_answer() correct answer scoring passed: Alice awarded % pts', v_res->>'points';

  -- 10. Test: submit_answer() Bob (incorrect answer: A, response time: 1s)
  v_res := submit_answer(v_room_code, v_player_b_id, v_question_id, 'A', 1000);
  if not (v_res->>'success')::boolean then
    raise exception '❌ TEST FAILED: submit_answer for Bob failed: %', v_res->>'error';
  end if;
  if (v_res->>'is_correct')::boolean or (v_res->>'points')::int != 0 then
    raise exception '❌ TEST FAILED: submit_answer incorrect calculation failed: %', v_res;
  end if;
  raise notice '10. submit_answer() incorrect answer scoring passed: Bob awarded % pts', v_res->>'points';

  -- 11. Test: get_leaderboard()
  v_res := get_leaderboard(v_room_code, 10);
  if not (v_res->>'success')::boolean then
    raise exception '❌ TEST FAILED: get_leaderboard failed with error: %', v_res->>'error';
  end if;
  if (v_res->'players'->0->>'name') != 'Alice' then
    raise exception '❌ TEST FAILED: leaderboard ranking logic failed: %', v_res;
  end if;
  raise notice '11. get_leaderboard() passed. Ranking: %', v_res->'players';

  -- 12. Test: get_question_results()
  v_res := get_question_results(v_room_code, v_question_id);
  if not (v_res->>'success')::boolean then
    raise exception '❌ TEST FAILED: get_question_results failed with error: %', v_res->>'error';
  end if;
  if (v_res->'results'->>'total_responses')::int != 2 or
     (v_res->'results'->'distribution'->>'A')::int != 1 or
     (v_res->'results'->'distribution'->>'B')::int != 1 then
    raise exception '❌ TEST FAILED: get_question_results distribution failed: %', v_res;
  end if;
  raise notice '12. get_question_results() passed. Distribution: %', v_res->'results'->'distribution';

  -- 13. Test: end_game()
  v_res := end_game(v_room_code);
  if not (v_res->>'success')::boolean then
    raise exception '❌ TEST FAILED: end_game failed with error: %', v_res->>'error';
  end if;
  if not exists (select 1 from rooms where id = v_room_id and status = 'finished') then
    raise exception '❌ TEST FAILED: end_game succeeded but room status is not finished';
  end if;
  raise notice '13. end_game() passed. Room status is finished.';

  raise notice '============================================================';
  raise notice ' 🎉 ALL DATABASE UNIT TESTS PASSED SUCCESSFULLY! ✓';
  raise notice '============================================================';
end;
$$;

rollback;
