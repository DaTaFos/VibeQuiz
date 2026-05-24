import { NextResponse } from 'next/server'
import Pusher from 'pusher'

const pusher = new Pusher({
  appId: 'app-id',
  key: process.env.NEXT_PUBLIC_PUSHER_KEY || 'app-key',
  secret: process.env.PUSHER_SECRET || 'app-secret',
  host: process.env.NEXT_PUBLIC_PUSHER_HOST || '127.0.0.1',
  port: process.env.NEXT_PUBLIC_PUSHER_PORT || '6001',
  useTLS: process.env.NEXT_PUBLIC_PUSHER_TLS === 'true',
})

export async function POST(req: Request) {
  try {
    const bodyText = await req.text()
    const params = new URLSearchParams(bodyText)
    const socketId = params.get('socket_id')!
    const channelName = params.get('channel_name')!

    const playerId = req.headers.get('x-player-id') || 'host'
    const playerName = decodeURIComponent(req.headers.get('x-player-name') || 'Host')
    const playerAvatar = decodeURIComponent(req.headers.get('x-player-avatar') || '')

    const presenceData = {
      user_id: playerId,
      user_info: {
        playerId,
        name: playerName,
        avatar: playerAvatar,
      },
    }

    const authResponse = pusher.authorizeChannel(socketId, channelName, presenceData)
    return NextResponse.json(authResponse)
  } catch (error: any) {
    console.error('API PUSHER AUTH ERROR:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
