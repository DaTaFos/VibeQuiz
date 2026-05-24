import Pusher from 'pusher-js'

export const getPusherClient = (playerInfo?: { playerId: string; name: string; avatar: string | null }) => {
  return new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
    wsHost: process.env.NEXT_PUBLIC_PUSHER_HOST || '127.0.0.1',
    wsPort: parseInt(process.env.NEXT_PUBLIC_PUSHER_PORT || '6001'),
    wssPort: parseInt(process.env.NEXT_PUBLIC_PUSHER_PORT || '6001'),
    forceTLS: process.env.NEXT_PUBLIC_PUSHER_TLS === 'true',
    disableStats: true,
    enabledTransports: ['ws', 'wss'],
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'mt1',
    channelAuthorization: {
      endpoint: '/api/pusher/auth',
      transport: 'ajax',
      headersProvider: () => ({
        'x-player-id': playerInfo?.playerId || 'host',
        'x-player-name': encodeURIComponent(playerInfo?.name || 'Host'),
        'x-player-avatar': encodeURIComponent(playerInfo?.avatar || ''),
      }),
    },
  })
}
