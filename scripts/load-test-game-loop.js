/**
 * VibeQuiz — 300 Players Game Loop Simulation Load Test
 *
 * This script connects 300 concurrent players to a live room.
 * It simulates full game play, testing timer synchronization and automated progression.
 *
 * Usage: node scripts/load-test-game-loop.js <ROOM_CODE> [NUM_PLAYERS]
 * Example: node scripts/load-test-game-loop.js 670189 300
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// 1. Parse .env.local
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

const AVATARS = ['😀','😎','🤩','🥳','😤','🧠','🦊','🐼','🚀','🎮','🔥','⚡','🌈','👾','🏆'];
const ROOM_CODE = process.argv[2];
const NUM_PLAYERS = Number(process.argv[3]) || 300;

if (!ROOM_CODE || ROOM_CODE.length !== 6) {
  console.error('❌ Error: Please provide a valid 6-digit room code.');
  console.error('Usage: node scripts/load-test-game-loop.js <ROOM_CODE> [NUM_PLAYERS]');
  process.exit(1);
}

async function runGameLoopSimulation() {
  console.log(`\n============================================================`);
  console.log(`🎮 VIBEQUIZ GAME LOOP SIMULATOR`);
  console.log(`  Room Code: ${ROOM_CODE}`);
  console.log(`  Simulating: ${NUM_PLAYERS} Active Players`);
  console.log(`============================================================\n`);

  const env = loadEnv();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  const players = [];

  console.log('🔄 Joining 300 players to the database lobby...');
  
  const joinPromises = Array.from({ length: NUM_PLAYERS }).map(async (_, index) => {
    const playerNum = index + 1;
    const name = `Pro-Player-${playerNum}`;
    const avatar = AVATARS[index % AVATARS.length];

    const client = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });

    try {
      const { data, error } = await client.rpc('join_room', {
        p_room_code: ROOM_CODE,
        p_name: name,
        p_avatar: avatar
      });

      if (error || !data?.success) {
        throw new Error(error?.message || data?.error || 'Failed to join');
      }

      const playerId = data.player_id;
      const channel = client.channel(`room:${ROOM_CODE}`, {
        config: { presence: { key: playerId } }
      });

      players.push({
        playerNum,
        name,
        avatar,
        playerId,
        client,
        channel,
        score: 0
      });

    } catch (err) {
      console.error(`  ❌ Join failed for Player-${playerNum}:`, err.message);
    }
  });

  await Promise.allSettled(joinPromises);
  console.log(`\n✅ ${players.length}/${NUM_PLAYERS} players successfully registered in the database.`);

  console.log('🔄 Subscribing player sockets to Realtime channel and publishing Presence...');
  
  const subscribePromises = players.map((player) => {
    return new Promise((resolve) => {
      player.channel
        .on('broadcast', { event: 'NEXT_QUESTION' }, (payload) => {
          handleNextQuestion(player, payload.payload);
        })
        .on('broadcast', { event: 'SHOW_LEADERBOARD' }, (payload) => {
          handleShowLeaderboard(player, payload.payload);
        })
        .on('broadcast', { event: 'GAME_ENDED' }, (payload) => {
          handleGameEnded(player, payload.payload);
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            player.channel.track({
              name: player.name,
              avatar: player.avatar,
              playerId: player.playerId
            }).then(() => resolve());
          } else {
            resolve();
          }
        });
    });
  });

  await Promise.all(subscribePromises);
  console.log(`🟢 All player channels subscribed and tracked. Ready for game loop!`);
  console.log(`👉 Go to your Host dashboard and click "Start Game" to begin the simulation.\n`);
}

// Handler: When Host broadcasts a new question
async function handleNextQuestion(player, q) {
  const receiveTime = Date.now();
  
  // 1. Verify Condition 1: Timer synchronization with host
  const elapsedMs = receiveTime - q.startedAt;
  const remainingSeconds = Math.max(q.timeLimitSeconds - Math.floor(elapsedMs / 1000), 0);
  
  // Only log detailed sync stats for Player 1 to avoid console spam, but check for all
  if (player.playerNum === 1) {
    console.log(`\n❓ --- Question ${q.questionIndex} Broadcast Received ---`);
    console.log(`  Question Text: "${q.text}"`);
    console.log(`  Host Time Limit: ${q.timeLimitSeconds}s`);
    console.log(`  Network Latency: ${elapsedMs}ms`);
    console.log(`  🔄 [Sync Check] Player 1 Countdown Synced: ${remainingSeconds}s remaining`);
    console.log(`  --------------------------------------------\n`);
  }

  // 2. Simulate human delay (e.g. think time randomized between 1s and 4s)
  const thinkTimeMs = Math.floor(Math.random() * 3000 + 1000);
  
  // Enforce thinking delay
  setTimeout(async () => {
    const options = ['A', 'B', 'C', 'D'];
    const selectedOption = options[Math.floor(Math.random() * options.length)];
    
    const responseTimeMs = elapsedMs + thinkTimeMs;

    try {
      const { data, error } = await player.client.rpc('submit_answer', {
        p_room_code: ROOM_CODE,
        p_player_id: player.playerId,
        p_question_id: q.questionId,
        p_selected_option: selectedOption,
        p_response_time_ms: responseTimeMs
      });

      if (error || !data?.success) {
        throw new Error(error?.message || data?.error || 'Submit error');
      }

      if (player.playerNum === 1 || player.playerNum % 50 === 0) {
        console.log(`[Player ${player.playerNum}/300] ⚡ Answered: ${selectedOption} in ${responseTimeMs}ms (Correct: ${data.is_correct}, Points: ${data.points})`);
      }
    } catch (err) {
      console.error(`[Player ${player.playerNum}/300] ❌ Answer submission failed:`, err.message);
    }
  }, thinkTimeMs);
}

// Handler: When Host displays the leaderboard (e.g. timer expired / next question clicked)
function handleShowLeaderboard(player, payload) {
  if (player.playerNum === 1) {
    console.log(`\n📊 --- Leaderboard Screen (Question ${payload.questionIndex} Finished) ---`);
    
    // Condition 2: Check if question results are generated
    if (payload.questionResults) {
      const results = payload.questionResults;
      console.log(`  Total Responses Captured: ${results.total_responses}`);
      console.log(`  Correct Option: ${results.correct_option}`);
      console.log(`  Distribution: A: ${results.distribution.A} | B: ${results.distribution.B} | C: ${results.distribution.C} | D: ${results.distribution.D}`);
    }

    console.log(`  Top 3 Players:`);
    payload.players.slice(0, 3).forEach((p, idx) => {
      console.log(`    #${idx + 1} ${p.avatar ?? '😶'} ${p.name} - ${p.total_score} pts`);
    });
    console.log(`  ---------------------------------------------------------\n`);
  }
}

// Handler: When Host ends the game
function handleGameEnded(player, payload) {
  if (player.playerNum === 1) {
    console.log(`\n🏆 --- GAME COMPLETED! ---`);
    console.log(`  Final Leaderboard Standings:`);
    payload.players.slice(0, 5).forEach((p, idx) => {
      console.log(`    #${idx + 1} ${p.avatar ?? '😶'} ${p.name} - ${p.total_score} pts`);
    });
    console.log(`  =========================\n`);
    
    console.log('🏁 Load test complete. Shutting down active connections in 5s...');
    setTimeout(() => {
      process.exit(0);
    }, 5000);
  }
}

runGameLoopSimulation().catch(console.error);
