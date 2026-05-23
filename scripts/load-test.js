/**
 * VibeQuiz — Dynamic Concurrency Load Test
 *
 * This script instantiates custom player sockets, performs 'join_room' RPC,
 * and tracks their presence on the selected room channel simultaneously.
 *
 * Run it with: node scripts/load-test.js <ROOM_CODE> <NUM_PLAYERS>
 * Example: node scripts/load-test.js 670189 300
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
const ROOM_CODE = process.argv[2] || '670189';
const NUM_PLAYERS = Number(process.argv[3]) || 60;

async function runLoadTest() {
  console.log(`🧪 Starting VibeQuiz Load Test with ${NUM_PLAYERS} concurrent players in room ${ROOM_CODE}...`);
  const env = loadEnv();

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase URL or Publishable Key missing in .env.local');
    process.exit(1);
  }

  console.log(`Connected to Supabase Project: ${supabaseUrl}`);

  const clients = [];
  const channels = [];

  let joinedCount = 0;
  let subscribedCount = 0;

  const joinPromises = Array.from({ length: NUM_PLAYERS }).map(async (_, index) => {
    const playerNum = index + 1;
    const name = `Guest-${playerNum}`;
    const avatar = AVATARS[index % AVATARS.length];

    // Create unique client per player to isolate sockets and sessions
    const client = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });

    clients.push(client);

    try {
      // 1. Join room via RPC
      const { data, error } = await client.rpc('join_room', {
        p_room_code: ROOM_CODE,
        p_name: name,
        p_avatar: avatar
      });

      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || 'Failed to join');
      }

      const playerId = data.player_id;
      joinedCount++;
      console.log(`[${playerNum}/${NUM_PLAYERS}] ✅ RPC Joined: ${name} (ID: ${playerId})`);

      // 2. Track Presence in Realtime Room Channel
      return new Promise((resolve, reject) => {
        const channel = client.channel(`room:${ROOM_CODE}`, {
          config: { presence: { key: playerId } }
        });

        channels.push(channel);

        channel
          .on('presence', { event: 'sync' }, () => {
            // Optional sync logging
          })
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              subscribedCount++;
              // Track player info in presence
              channel.track({ name, avatar, playerId })
                .then(() => {
                  console.log(`[${playerNum}/${NUM_PLAYERS}] 🟢 Presence Tracked: ${name}`);
                  resolve();
                })
                .catch((trackErr) => {
                  console.error(`[${playerNum}/${NUM_PLAYERS}] ❌ Track Presence failed for ${name}:`, trackErr);
                  reject(trackErr);
                });
            } else if (status === 'TIMED_OUT' || status === 'CLOSED') {
              console.error(`[${playerNum}/${NUM_PLAYERS}] ⚠️ Realtime connection: ${status} for ${name}`);
            }
          });
      });

    } catch (err) {
      console.error(`[${playerNum}/${NUM_PLAYERS}] ❌ Failed for ${name}:`, err.message);
    }
  });

  await Promise.allSettled(joinPromises);

  console.log(`\n=======================================`);
  console.log(`🏁 LOAD TEST SUMMARY:`);
  console.log(`  RPC Joined: ${joinedCount}/${NUM_PLAYERS}`);
  console.log(`  Realtime Presence Tracked: ${subscribedCount}/${NUM_PLAYERS}`);
  console.log(`=======================================`);
  console.log(`Script will remain running to keep clients connected. Press Ctrl+C to terminate.\n`);

  // Keep script alive indefinitely
  await new Promise(() => {});
}

runLoadTest().catch(console.error);
