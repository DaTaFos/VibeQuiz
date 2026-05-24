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
    const { roomCode, payload } = await req.json()
    
    // Trigger the broadcast event to the room's presence channel
    await pusher.trigger(`presence-room-${roomCode}`, payload.type, payload)
    
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('API BROADCAST ERROR:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
