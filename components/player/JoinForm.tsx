'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { savePlayerSession } from '@/lib/session'

export default function JoinForm({ prefillCode = '' }: { prefillCode?: string }) {
  const router = useRouter()
  const [roomCode, setRoomCode] = useState(prefillCode)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const code = roomCode.trim().replace(/\D/g, '').slice(0, 6)
    if (code.length !== 6) { setError('Please enter a valid 6-digit room code.'); return }
    if (!name.trim()) { setError('Please enter your name.'); return }

    setLoading(true)
    const supabase = createClient()
    const { data, error: rpcErr } = await supabase.rpc('join_room', {
      p_room_code: code,
      p_name: name.trim(),
      p_avatar: null,
    })

    if (rpcErr || !data?.success) {
      const msg = data?.error ?? rpcErr?.message ?? 'Failed to join room'
      setError(
        msg === 'ROOM_NOT_FOUND_OR_STARTED'
          ? 'Room not found or game already started.'
          : msg === 'INVALID_NAME'
          ? 'Name must be between 1 and 30 characters.'
          : 'That name is already taken in this room.'
      )
      setLoading(false)
      return
    }

    savePlayerSession({
      playerId: data.player_id,
      roomCode: code,
      name: name.trim(),
      avatar: null,
    })

    router.push(`/play/${code}`)
  }

  return (
    <form onSubmit={handleJoin} className="space-y-6">
      <div>
        <label htmlFor="room-code" className="block text-sm font-medium text-gray-300 mb-2">
          Room Code
        </label>
        <input
          id="room-code"
          type="text"
          inputMode="numeric"
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="123456"
          className="input-field text-center text-3xl font-black tracking-[0.3em] py-4"
          maxLength={6}
          required
        />
      </div>

      <div>
        <label htmlFor="player-name" className="block text-sm font-medium text-gray-300 mb-2">
          Your Name
        </label>
        <input
          id="player-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 30))}
          placeholder="Enter your name"
          className="input-field"
          maxLength={30}
          required
        />
      </div>

      {error && (
        <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="btn-primary w-full text-lg py-4"
        id="join-game-btn"
      >
        {loading ? 'Joining…' : '🎮 Join Game'}
      </button>
    </form>
  )
}

