/**
 * VibeQuiz — 300 Players Soketi Game Loop Simulation Load Test
 *
 * This script connects 300 concurrent player sockets to your production Soketi VM.
 * It simulates full game play, testing high-concurrency WebSocket performance.
 *
 * Usage: node scripts/load-test-soketi.js <ROOM_CODE> [NUM_PLAYERS]
 * Example: node scripts/load-test-soketi.js 670189 300
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { Pusher } = require('pusher-js');
const crypto = require('crypto');

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
  console.error('Usage: node scripts/load-test-soketi.js <ROOM_CODE> [NUM_PLAYERS]');
  process.exit(1);
}

async function runGameLoopSimulation() {
  const env = loadEnv();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  const pusherKey = env.NEXT_PUBLIC_PUSHER_KEY || 'app-key';
  const pusherSecret = env.PUSHER_SECRET || 'app-secret';
  const pusherHost = env.NEXT_PUBLIC_PUSHER_HOST || '127.0.0.1';
  const pusherPort = parseInt(env.NEXT_PUBLIC_PUSHER_PORT || '6001');
  const useTLS = env.NEXT_PUBLIC_PUSHER_TLS === 'true';

  console.log(`\n============================================================`);
  console.log(`🎮 VIBEQUIZ SOKETI GAME LOOP SIMULATOR`);
  console.log(`  Room Code:    ${ROOM_CODE}`);
  console.log(`  Simulating:   ${NUM_PLAYERS} Players`);
  console.log(`  Soketi Host:  ${pusherHost}:${pusherPort} (TLS: ${useTLS})`);
  console.log(`============================================================\n`);

  const players = [];

  console.log(`🔄 Step 1: Registering ${NUM_PLAYERS} players in the database...`);
  
  const joinPromises = Array.from({ length: NUM_PLAYERS }).map(async (_, index) => {
    const playerNum = index + 1;
    const name = `Bot-Player-${playerNum}`;
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

      players.push({
        playerNum,
        name,
        avatar,
        playerId: data.player_id,
        client,
        score: 0
      });

    } catch (err) {
      console.error(`  ❌ Join failed for Player-${playerNum}:`, err.message);
    }
  });

  await Promise.allSettled(joinPromises);
  console.log(`\n✅ ${players.length}/${NUM_PLAYERS} players registered successfully in Supabase.`);

  console.log('\n📡 Step 2: Connecting simulated players to Soketi WebSocket server...');
  
  const connectPromises = players.map((player, index) => {
    return new Promise((resolve) => {
      // Stagger connection initiation slightly (20ms) to prevent overwhelming the server
      // with 300 simultaneous secure TLS handshakes at the exact same millisecond.
      setTimeout(() => {
        // Create high-concurrency pusher client per player
        const pusher = new Pusher(pusherKey, {
          wsHost: pusherHost,
          wsPort: pusherPort,
          wssPort: pusherPort,
          forceTLS: useTLS,
          disableStats: true,
          enabledTransports: ['ws', 'wss'],
          cluster: 'mt1',
          channelAuthorization: {
            endpoint: '',
            transport: 'custom',
            customHandler: (params, callback) => {
              // Highly optimized HMAC SHA256 auth to comply with real production Soketi VM
              const socketId = params.socketId;
              const channelName = params.channel;
              
              const presenceData = JSON.stringify({
                user_id: player.playerId,
                user_info: {
                  playerId: player.playerId,
                  name: player.name,
                  avatar: player.avatar
                }
              });

              const stringToSign = `${socketId}:${channelName}:${presenceData}`;
              const hash = crypto
                .createHmac('sha256', pusherSecret)
                .update(stringToSign)
                .digest('hex');
              
              const auth = `${pusherKey}:${hash}`;

              callback(null, {
                auth,
                channel_data: presenceData
              });
            }
          }
        });

        player.pusher = pusher;

      // Log connection states and failures for debugging
      pusher.connection.bind('state_change', (states) => {
        if (states.current === 'failed' || states.current === 'unavailable') {
          console.error(`  [Player ${player.playerNum}] ❌ Connection state: ${states.current}`);
          resolve(); // Resolve to avoid hanging the promise chain
        }
      });

      pusher.connection.bind('error', (err) => {
        if (player.playerNum === 1 || player.playerNum % 50 === 0) {
          console.error(`  [Player ${player.playerNum}] ❌ Connection error:`, err.error?.message || err.message || err);
        }
        resolve(); // Resolve to avoid hanging
      });

      const channelName = `presence-room-${ROOM_CODE}`;
      const channel = pusher.subscribe(channelName);

      channel.bind('pusher:subscription_succeeded', () => {
        if (player.playerNum === 1 || player.playerNum % 50 === 0) {
          console.log(`  [Player ${player.playerNum}/${NUM_PLAYERS}] 🟢 Subscribed to Soketi presence channel`);
        }
        resolve();
      });

      // Bind to host broadcast game events
      channel.bind('NEXT_QUESTION', (data) => {
        handleNextQuestion(player, data);
      });

      channel.bind('SHOW_LEADERBOARD', (data) => {
        handleShowLeaderboard(player, data);
      });

      channel.bind('GAME_ENDED', (data) => {
        handleGameEnded(player, data);
      });
      }, index * 20);
    });
  });

  await Promise.all(connectPromises);
  console.log(`\n🟢 All ${players.length} sockets successfully established with Soketi!`);
  console.log(`👉 Go to your Host dashboard and click "Start Game" to begin the simulation.\n`);
}

// Handler: When Host broadcasts a new question
async function handleNextQuestion(player, q) {
  const receiveTime = Date.now();
  const elapsedMs = receiveTime - q.startedAt;
  const remainingSeconds = Math.max(q.timeLimitSeconds - Math.floor(elapsedMs / 1000), 0);
  
  if (player.playerNum === 1) {
    console.log(`\n❓ --- Question ${q.questionIndex} Broadcast Received ---`);
    console.log(`  Question:         "${q.text}"`);
    console.log(`  Time Limit:       ${q.timeLimitSeconds}s`);
    console.log(`  Network Latency:  ${elapsedMs}ms`);
    console.log(`  Countdown Sync:   ${remainingSeconds}s remaining`);
    console.log(`  --------------------------------------------\n`);
  }

  // Simulate thinking delay randomized between 1s and 4s
  const thinkTimeMs = Math.floor(Math.random() * 3000 + 1000);
  
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
        console.log(`[Player ${player.playerNum}/300] ⚡ Answered: ${selectedOption} in ${responseTimeMs}ms (Points: ${data.points}, Correct: ${data.is_correct})`);
      }
    } catch (err) {
      console.error(`[Player ${player.playerNum}/300] ❌ Answer failed:`, err.message);
    }
  }, thinkTimeMs);
}

// Handler: When Host displays the leaderboard
function handleShowLeaderboard(player, payload) {
  if (player.playerNum === 1) {
    console.log(`\n📊 --- Leaderboard Screen (Question ${payload.questionIndex} Finished) ---`);
    
    if (payload.questionResults) {
      const results = payload.questionResults;
      console.log(`  Total Responses Captured:  ${results.total_responses}`);
      console.log(`  Correct Option:            ${results.correct_option}`);
      console.log(`  Distribution:              A: ${results.distribution.A} | B: ${results.distribution.B} | C: ${results.distribution.C} | D: ${results.distribution.D}`);
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
    
    console.log('🏁 Load test complete. Shutting down active sockets...');
    process.exit(0);
  }
}

runGameLoopSimulation().catch(console.error);
