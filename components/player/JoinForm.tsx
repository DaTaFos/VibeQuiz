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

    const randomAvatar = generateRandomAvatar()

    setLoading(true)
    const supabase = createClient()
    const { data, error: rpcErr } = await supabase.rpc('join_room', {
      p_room_code: code,
      p_name: name.trim(),
      p_avatar: randomAvatar,
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
      avatar: randomAvatar,
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

function generateRandomAvatar(): string {
  const SKIN_COLORS = ['f2d3b1', 'ecad80', '9e5622', '763900']
  const HAIR_STYLES = [
    'none', 'short01', 'short02', 'short03', 'short04', 'short05', 
    'short06', 'short08', 'short10', 'short12', 'short14', 'short16', 
    'short18', 'long01', 'long02', 'long03', 'long04', 'long05', 
    'long06', 'long08', 'long10', 'long12', 'long14', 'long16', 
    'long18', 'long20', 'long22', 'long24'
  ]
  const HAIR_COLORS = [
    '0e0e0e', '6a4e35', '796a45', 'b9a05f', 'e5d7a3', 'cb6820', 
    'ac6511', 'ab2a18', 'afafaf', '3eac2c', '85c2c6', 'dba3be', '592454'
  ]
  const EYES = [
    'variant01', 'variant02', 'variant03', 'variant04', 'variant05', 
    'variant06', 'variant07', 'variant08', 'variant09', 'variant10', 
    'variant11', 'variant12', 'variant14', 'variant16', 'variant18', 
    'variant20', 'variant22', 'variant24', 'variant26'
  ]
  const EYEBROWS = [
    'variant01', 'variant02', 'variant03', 'variant04', 'variant05', 
    'variant06', 'variant07', 'variant08', 'variant09', 'variant10', 
    'variant11', 'variant12', 'variant13', 'variant14', 'variant15'
  ]
  const MOUTHS = [
    'variant01', 'variant02', 'variant03', 'variant04', 'variant05', 
    'variant06', 'variant07', 'variant08', 'variant09', 'variant10', 
    'variant11', 'variant12', 'variant13', 'variant14', 'variant15', 
    'variant16', 'variant17', 'variant18', 'variant19', 'variant20', 
    'variant21', 'variant22', 'variant23', 'variant24', 'variant25', 
    'variant26', 'variant27', 'variant28', 'variant29', 'variant30'
  ]
  const GLASSES_STYLES = ['none', 'variant01', 'variant02', 'variant03', 'variant04', 'variant05']
  const FEATURES_STYLES = ['none', 'mustache', 'blush', 'birthmark', 'freckles']
  const EARRINGS_STYLES = ['none', 'variant01', 'variant02', 'variant03', 'variant04', 'variant05']

  const skinColor = SKIN_COLORS[Math.floor(Math.random() * SKIN_COLORS.length)]
  const hair = HAIR_STYLES[Math.floor(Math.random() * HAIR_STYLES.length)]
  const hairColor = HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)]
  const eyes = EYES[Math.floor(Math.random() * EYES.length)]
  const eyebrows = EYEBROWS[Math.floor(Math.random() * EYEBROWS.length)]
  const mouth = MOUTHS[Math.floor(Math.random() * MOUTHS.length)]
  const glasses = GLASSES_STYLES[Math.floor(Math.random() * GLASSES_STYLES.length)]
  const features = FEATURES_STYLES[Math.floor(Math.random() * FEATURES_STYLES.length)]
  const earrings = EARRINGS_STYLES[Math.floor(Math.random() * EARRINGS_STYLES.length)]

  const parts = []
  parts.push(`skinColor=${skinColor}`)
  if (hair && hair !== 'none') {
    parts.push(`hair=${hair}`)
    parts.push(`hairColor=${hairColor}`)
    parts.push('hairProbability=100')
  } else {
    parts.push('hairProbability=0')
  }
  parts.push(`eyes=${eyes}`)
  parts.push(`eyebrows=${eyebrows}`)
  parts.push(`mouth=${mouth}`)
  
  if (glasses && glasses !== 'none') {
    parts.push(`glasses=${glasses}`)
    parts.push('glassesProbability=100')
  } else {
    parts.push('glassesProbability=0')
  }
  
  if (features && features !== 'none') {
    parts.push(`features=${features}`)
    parts.push('featuresProbability=100')
  } else {
    parts.push('featuresProbability=0')
  }
  
  if (earrings && earrings !== 'none') {
    parts.push(`earrings=${earrings}`)
    parts.push('earringsProbability=100')
  } else {
    parts.push('earringsProbability=0')
  }
  
  return `adventurer:${parts.join('&')}`
}


