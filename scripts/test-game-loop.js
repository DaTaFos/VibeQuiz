/**
 * VibeQuiz — Anonymous Client Integration Test Runner
 *
 * This script runs standard Node.js to verify player-facing Supabase RPCs.
 * Run it with: node scripts/test-game-loop.js
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// 1. Parse .env.local without requiring external dotenv dependency
function loadEnv() {
  const envPath = path.join(__dirname, '../.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env.local file not found. Please set up your local environment.');
    process.exit(1);
  }

  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  content.split('\n').forEach((line) => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      let val = match[2] || '';
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
      env[match[1]] = val.trim();
    }
  });
  return env;
}

async function runTests() {
  console.log('🧪 Starting VibeQuiz Client Integration Tests...');
  const env = loadEnv();

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase URL or Publishable Key missing in .env.local');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      passed++;
      console.log(`  ✅ ${message}`);
    } else {
      failed++;
      console.error(`  ❌ FAILED: ${message}`);
    }
  }

  try {
    // Test 1: Query the public safe_questions view
    console.log('\n--- Test 1: safe_questions View (Security Invoker) ---');
    const { data: questions, error: qErr } = await supabase
      .from('safe_questions')
      .select('*')
      .limit(1);

    if (qErr) {
      assert(false, `Fetch safe_questions returned database error: ${qErr.message}`);
    } else {
      assert(Array.isArray(questions), 'safe_questions returned valid array');
      console.log(`  Found ${questions.length} question(s) accessible publicly.`);
    }

    // Test 2: Try to join a non-existent room code (Validates error handling in join_room RPC)
    console.log('\n--- Test 2: join_room RPC (Invalid Room Code) ---');
    const { data: joinRes, error: joinErr } = await supabase.rpc('join_room', {
      p_room_code: '000000',
      p_name: 'Test Runner',
      p_avatar: '🤖'
    });

    if (joinErr) {
      assert(false, `join_room returned database error: ${joinErr.message}`);
    } else {
      assert(
        joinRes.success === false && joinRes.error === 'ROOM_NOT_FOUND_OR_STARTED',
        'join_room correctly blocks non-existent rooms with ROOM_NOT_FOUND_OR_STARTED'
      );
    }

    // Test 3: Try to submit an answer to a non-existent room (Validates submit_answer RPC validation)
    console.log('\n--- Test 3: submit_answer RPC (Invalid Room Validation) ---');
    const { data: submitRes, error: submitErr } = await supabase.rpc('submit_answer', {
      p_room_code: '000000',
      p_player_id: '00000000-0000-0000-0000-000000000000',
      p_question_id: '00000000-0000-0000-0000-000000000000',
      p_selected_option: 'A',
      p_response_time_ms: 1000
    });

    if (submitErr) {
      assert(false, `submit_answer returned database error: ${submitErr.message}`);
    } else {
      assert(
        submitRes.success === false && submitRes.error === 'ROOM_NOT_ACTIVE',
        'submit_answer correctly blocks insertion into inactive rooms with ROOM_NOT_ACTIVE'
      );
    }

    // Test 4: Try to get a leaderboard for a non-existent room (Validates get_leaderboard RPC)
    console.log('\n--- Test 4: get_leaderboard RPC (Invalid Room Validation) ---');
    const { data: leaderRes, error: leaderErr } = await supabase.rpc('get_leaderboard', {
      p_room_code: '000000',
      p_limit: 5
    });

    if (leaderErr) {
      assert(false, `get_leaderboard returned database error: ${leaderErr.message}`);
    } else {
      assert(
        leaderRes.success === false && leaderRes.error === 'ROOM_NOT_FOUND',
        'get_leaderboard correctly handles empty/non-existent room codes'
      );
    }

  } catch (err) {
    console.error('❌ Unexpected runner crash:', err);
    failed++;
  }

  console.log('\n=======================================');
  console.log(`🏁 TEST RUNNER SUMMARY:`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log('=======================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('🎉 All client integration tests passed successfully!');
    process.exit(0);
  }
}

runTests();
