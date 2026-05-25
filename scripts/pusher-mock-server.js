const { WebSocketServer } = require('ws');
const http = require('http');

const PORT = 6001;

// Channels state: channelName -> Map(socketId -> { ws, userId, userInfo })
const channels = new Map();

const server = http.createServer((req, res) => {
  // Handle HTTP POST from Pusher Server triggers
  // Path pattern: /apps/:app_id/events
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const eventName = payload.name;
        const targetChannels = payload.channels || [payload.channel];
        const eventData = typeof payload.data === 'string' ? JSON.parse(payload.data) : payload.data;

        for (const channelName of targetChannels) {
          const subscribers = channels.get(channelName);
          if (subscribers) {
            const msg = JSON.stringify({
              event: eventName,
              channel: channelName,
              data: eventData
            });
            for (const [_, sub] of subscribers) {
              sub.ws.send(msg);
            }
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({}));
      } catch (err) {
        console.error('Error handling HTTP trigger broadcast:', err);
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws) => {
  const socketId = `${Math.floor(Math.random() * 1000000000)}.${Math.floor(Math.random() * 1000000000)}`;
  
  // 1. Send connection established payload immediately on connection
  ws.send(JSON.stringify({
    event: 'pusher:connection_established',
    data: JSON.stringify({
      socket_id: socketId,
      activity_timeout: 120
    })
  }));

  const subscribedChannels = new Set();

  ws.on('message', (messageText) => {
    try {
      const msg = JSON.parse(messageText.toString());
      const { event, data } = msg;

      if (event === 'pusher:ping') {
        ws.send(JSON.stringify({ event: 'pusher:pong' }));
      } else if (event === 'pusher:subscribe') {
        const { channel, auth, channel_data } = data;
        
        if (!channels.has(channel)) {
          channels.set(channel, new Map());
        }
        const subscribers = channels.get(channel);

        let userId = 'host';
        let userInfo = { playerId: 'host', name: 'Host', avatar: null };

        if (channel_data) {
          try {
            const parsedData = JSON.parse(channel_data);
            userId = parsedData.user_id || 'host';
            userInfo = parsedData.user_info || { playerId: userId, name: 'Host', avatar: null };
          } catch (e) {
            console.error('Error parsing channel_data:', e);
          }
        }

        subscribers.set(socketId, { ws, userId, userInfo });
        subscribedChannels.add(channel);

        // Acknowledge subscription success
        if (channel.startsWith('presence-')) {
          // Compile members list
          const hash = {};
          const ids = [];
          for (const [subId, sub] of subscribers) {
            hash[sub.userId] = sub.userInfo;
            ids.push(sub.userId);
          }

          ws.send(JSON.stringify({
            event: 'pusher_internal:subscription_succeeded',
            channel: channel,
            data: JSON.stringify({
              presence: {
                ids,
                hash,
                count: ids.length
              }
            })
          }));

          // Notify other members
          const memberAddedMsg = JSON.stringify({
            event: 'pusher_internal:member_added',
            channel: channel,
            data: JSON.stringify({
              user_id: userId,
              user_info: userInfo
            })
          });

          for (const [subId, sub] of subscribers) {
            if (subId !== socketId) {
              sub.ws.send(memberAddedMsg);
            }
          }
        } else {
          ws.send(JSON.stringify({
            event: 'pusher_internal:subscription_succeeded',
            channel: channel
          }));
        }
      } else if (event && event.startsWith('client-')) {
        const { channel, data: eventData } = msg;
        const subscribers = channels.get(channel);
        if (subscribers) {
          const broadcastMsg = JSON.stringify({
            event: event,
            channel: channel,
            data: typeof eventData === 'string' ? JSON.parse(eventData) : eventData
          });
          for (const [subId, sub] of subscribers) {
            if (subId !== socketId) {
              sub.ws.send(broadcastMsg);
            }
          }
        }
      }
    } catch (e) {
      console.error('Error handling WebSocket message:', e);
    }
  });

  ws.on('close', () => {
    for (const channelName of subscribedChannels) {
      const subscribers = channels.get(channelName);
      if (subscribers && subscribers.has(socketId)) {
        const member = subscribers.get(socketId);
        subscribers.delete(socketId);

        if (channelName.startsWith('presence-') && member) {
          const memberRemovedMsg = JSON.stringify({
            event: 'pusher_internal:member_removed',
            channel: channelName,
            data: JSON.stringify({
              user_id: member.userId
            })
          });

          for (const [_, sub] of subscribers) {
            sub.ws.send(memberRemovedMsg);
          }
        }
      }
    }
  });
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`📡 Pusher/Soketi Mock Server running on http://0.0.0.0:${PORT}`);
  console.log(`   Compatible with all versions of Node.js (no native uWS compilation required!)`);
  console.log(`   Press Ctrl + C to stop`);
});
