/**
 * VibeQuiz — 300 Players Soketi Game Loop Simulation Load Test
 *
 * This script connects 300 concurrent player sockets to your production Soketi VM.
 * It simulates full game play, testing high-concurrency WebSocket performance.
 *
 * Uses raw `ws` WebSocket connections implementing the Pusher wire protocol directly,
 * which is correct for Node.js. pusher-js is a browser library and does not reliably
 * support custom channel auth handlers in Node environments.
 *
 * Usage: node scripts/load-test-soketi.js <ROOM_CODE> [NUM_PLAYERS]
 * Example: node scripts/load-test-soketi.js 670189 300
 *
 * Dependencies: ws, @supabase/supabase-js
 *   npm install ws @supabase/supabase-js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');

// ---------------------------------------------------------------------------
// 1. Parse .env.local
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// 2. Config
// ---------------------------------------------------------------------------
const AVATARS = ['😀', '😎', '🤩', '🥳', '😤', '🧠', '🦊', '🐼', '🚀', '🎮', '🔥', '⚡', '🌈', '👾', '🏆'];
const ROOM_CODE = process.argv[2];
const NUM_PLAYERS = Number(process.argv[3]) || 300;

if (!ROOM_CODE || ROOM_CODE.length !== 6) {
  console.error('❌ Error: Please provide a valid 6-digit room code.');
  console.error('Usage: node scripts/load-test-soketi.js <ROOM_CODE> [NUM_PLAYERS]');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 3. Pusher wire-protocol helpers
//    Soketi speaks the standard Pusher WebSocket protocol:
//    https://pusher.com/docs/channels/library_auth_reference/pusher-websockets-protocol/
// ---------------------------------------------------------------------------

/**
 * Sign a presence-channel subscription using HMAC-SHA256.
 * stringToSign = "<socketId>:<channel>:<channelDataJSON>"
 */
function signPresenceAuth(pusherKey, pusherSecret, socketId, channel, presenceDataObj) {
  const channelData = JSON.stringify(presenceDataObj);
  const stringToSign = `${socketId}:${channel}:${channelData}`;
  const hash = crypto.createHmac('sha256', pusherSecret).update(stringToSign).digest('hex');
  return { auth: `${pusherKey}:${hash}`, channel_data: channelData };
}

/**
 * Create a raw WebSocket to Soketi and implement the Pusher protocol.
 * Returns a promise that resolves when the presence channel subscription
 * succeeds, or rejects/resolves-false on error/timeout.
 */
function createPusherSocket({ wsUrl, pusherKey, pusherSecret, player, channelName, timeoutMs }) {
  return new Promise((resolve) => {
    let settled = false;
    let socketId = null;

    const done = (ok, reason) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!ok) {
        console.error(`  [Player ${player.playerNum}] ❌ ${reason}`);
        resolve(false);
      } else {
        resolve(true);
      }
    };

    const timer = setTimeout(() => {
      done(false, `timeout after ${timeoutMs}ms waiting for subscription`);
      try { ws.terminate(); } catch (_) { }
    }, timeoutMs);

    const ws = new WebSocket(wsUrl, {
      headers: { Origin: 'load-test' },
      rejectUnauthorized: false // allow self-signed certs on dev/staging VMs
    });

    player.ws = ws;

    ws.on('error', (err) => {
      done(false, `WebSocket error: ${err.message}`);
    });

    ws.on('close', (code, reason) => {
      done(false, `WebSocket closed: ${code} ${reason}`);
    });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      const event = msg.event;
      const data = typeof msg.data === 'string' ? (() => { try { return JSON.parse(msg.data); } catch { return msg.data; } })() : (msg.data || {});

      // Step A: Server sends socket_id after connection
      if (event === 'pusher:connection_established') {
        socketId = data.socket_id;

        // Step B: Subscribe to the presence channel
        const presenceDataObj = {
          user_id: player.playerId,
          user_info: {
            playerId: player.playerId,
            name: player.name,
            avatar: player.avatar
          }
        };
        const { auth, channel_data } = signPresenceAuth(
          pusherKey, pusherSecret, socketId, channelName, presenceDataObj
        );

        ws.send(JSON.stringify({
          event: 'pusher:subscribe',
          data: { channel: channelName, auth, channel_data }
        }));
        return;
      }

      // Step C: Subscription confirmed
      if (event === 'pusher:subscription_succeeded' || event === 'pusher_internal:subscription_succeeded') {
        if (player.playerNum === 1 || player.playerNum % 50 === 0) {
          console.log(`  [Player ${player.playerNum}/${NUM_PLAYERS}] 🟢 Subscribed to Soketi presence channel`);
        }
        done(true);

        // Re-bind game event handlers after settling (ws stays open)
        ws.removeAllListeners('close');
        ws.on('message', (raw2) => handleGameMessage(player, raw2));
        return;
      }

      // Step D: Subscription rejected
      if (event === 'pusher:subscription_error' || event === 'pusher:error') {
        const errMsg = data?.message || data?.error || JSON.stringify(data);
        const status = data?.status ? ` (status ${data.status})` : '';
        done(false, `subscription_error${status}: ${errMsg}`);
        return;
      }

      // Step E: Server ping — keep the connection alive
      if (event === 'pusher:ping') {
        ws.send(JSON.stringify({ event: 'pusher:pong', data: {} }));
      }
    });
  });
}

// ---------------------------------------------------------------------------
// 4. Game event handlers (reused from original script)
// ---------------------------------------------------------------------------
function handleGameMessage(player, raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }

  const event = msg.event;
  const data = typeof msg.data === 'string' ? (() => { try { return JSON.parse(msg.data); } catch { return msg.data; } })() : (msg.data || {});

  if (event === 'NEXT_QUESTION') handleNextQuestion(player, data);
  if (event === 'SHOW_LEADERBOARD') handleShowLeaderboard(player, data);
  if (event === 'GAME_ENDED') handleGameEnded(player, data);

  // Keep-alive
  if (event === 'pusher:ping') {
    try { player.ws.send(JSON.stringify({ event: 'pusher:pong', data: {} })); } catch (_) { }
  }
}

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

      if (error || !data?.success) throw new Error(error?.message || data?.error || 'Submit error');

      if (player.playerNum === 1 || player.playerNum % 50 === 0) {
        console.log(`[Player ${player.playerNum}/300] ⚡ Answered: ${selectedOption} in ${responseTimeMs}ms (Points: ${data.points}, Correct: ${data.is_correct})`);
      }
    } catch (err) {
      console.error(`[Player ${player.playerNum}/300] ❌ Answer failed:`, err.message);
    }
  }, thinkTimeMs);
}

function handleShowLeaderboard(player, payload) {
  if (player.playerNum === 1) {
    console.log(`\n📊 --- Leaderboard Screen (Question ${payload.questionIndex} Finished) ---`);
    if (payload.questionResults) {
      const r = payload.questionResults;
      console.log(`  Total Responses:  ${r.total_responses}`);
      console.log(`  Correct Option:   ${r.correct_option}`);
      console.log(`  Distribution:     A: ${r.distribution.A} | B: ${r.distribution.B} | C: ${r.distribution.C} | D: ${r.distribution.D}`);
    }
    console.log(`  Top 3 Players:`);
    payload.players.slice(0, 3).forEach((p, idx) => {
      console.log(`    #${idx + 1} ${p.avatar ?? '😶'} ${p.name} - ${p.total_score} pts`);
    });
    console.log(`  ---------------------------------------------------------\n`);
  }
}

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

// ---------------------------------------------------------------------------
// 5. Main
// ---------------------------------------------------------------------------
async function runGameLoopSimulation() {
  const env = loadEnv();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const pusherKey = env.NEXT_PUBLIC_PUSHER_KEY || 'app-key';
  const pusherSecret = env.PUSHER_SECRET || 'app-secret';
  const pusherHost = env.NEXT_PUBLIC_PUSHER_HOST || '127.0.0.1';
  const pusherPort = parseInt(env.NEXT_PUBLIC_PUSHER_PORT || '6001');
  const useTLS = env.NEXT_PUBLIC_PUSHER_TLS === 'true';

  const wsProtocol = useTLS ? 'wss' : 'ws';
  // Soketi WebSocket URL format: ws(s)://host:port/app/<key>?protocol=7
  const wsUrl = `${wsProtocol}://${pusherHost}:${pusherPort}/app/${pusherKey}?protocol=7&client=js&version=7.0.3`;

  console.log(`\n============================================================`);
  console.log(`🎮 VIBEQUIZ SOKETI GAME LOOP SIMULATOR`);
  console.log(`  Room Code:    ${ROOM_CODE}`);
  console.log(`  Simulating:   ${NUM_PLAYERS} Players`);
  console.log(`  Soketi Host:  ${pusherHost}:${pusherPort} (TLS: ${useTLS})`);
  console.log(`  WS URL:       ${wsUrl}`);
  console.log(`  Pusher Key:   ${pusherKey}`);
  console.log(`  Secret set:   ${pusherSecret ? 'yes' : '❌ MISSING'}`);
  console.log(`============================================================\n`);

  // --- Step 1: Register players in Supabase ---
  console.log(`🔄 Step 1: Registering ${NUM_PLAYERS} players in the database...`);
  const players = [];

  const joinPromises = Array.from({ length: NUM_PLAYERS }).map(async (_, index) => {
    // Stagger database joins to avoid Supabase Free Tier rate limits (approx 28 joins/sec)
    await new Promise((resolve) => setTimeout(resolve, index * 35));

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

      if (error || !data?.success) throw new Error(error?.message || data?.error || 'Failed to join');

      players.push({ playerNum, name, avatar, playerId: data.player_id, client, score: 0 });
    } catch (err) {
      console.error(`  ❌ Join failed for Player-${playerNum}:`, err.message);
    }
  });

  await Promise.allSettled(joinPromises);
  console.log(`\n✅ ${players.length}/${NUM_PLAYERS} players registered successfully in Supabase.`);

  // --- Step 2: Connect raw WebSockets ---
  console.log('\n📡 Step 2: Connecting simulated players to Soketi WebSocket server...');

  // 400 players × 30ms stagger = last player starts at ~12s; 40s gives ample headroom.
  const SOCKET_TIMEOUT_MS = 40000;
  const channelName = `presence-room-${ROOM_CODE}`;

  let successCount = 0;
  let failCount = 0;

  const connectPromises = players.map((player, index) =>
    new Promise((resolve) => {
      setTimeout(async () => {
        const ok = await createPusherSocket({
          wsUrl,
          pusherKey,
          pusherSecret,
          player,
          channelName,
          timeoutMs: SOCKET_TIMEOUT_MS
        });
        if (ok) successCount++; else failCount++;
        resolve();
      }, index * 30);
    })
  );

  await Promise.allSettled(connectPromises);

  console.log(`\n🟢 Step 2 complete — ${successCount} connected, ${failCount} failed out of ${players.length} players.`);

  if (successCount === 0) {
    console.error('❌ No players connected. Check PUSHER_SECRET, host/port, and that Soketi is reachable.');
    process.exit(1);
  }

  console.log(`👉 Go to your Host dashboard and click "Start Game" to begin the simulation.\n`);
}

runGameLoopSimulation().catch(console.error);