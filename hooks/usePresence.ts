'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface PresencePlayer {
  name: string
  avatar: string | null
  playerId: string
}

/**
 * Presence hook for the lobby player list.
 * Host subscribes to see who joins; players track their own presence.
 */
export function usePresence(roomCode: string, playerInfo?: PresencePlayer) {
  const supabase = createClient()
  const [players, setPlayers] = useState<PresencePlayer[]>([])
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => {
    if (!roomCode) return

    const channel = supabase.channel(`room:${roomCode}`, {
      config: { presence: { key: playerInfo?.playerId ?? 'host' } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresencePlayer>()
        const list = Object.values(state)
          .flat()
          .filter((p) => p.playerId) // exclude host
        setPlayers(list as PresencePlayer[])
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && playerInfo) {
          await channel.track(playerInfo)
        }
      })

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomCode, supabase]) // eslint-disable-line react-hooks/exhaustive-deps

  return { players }
}
