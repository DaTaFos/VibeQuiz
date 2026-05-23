'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type {
  NextQuestionPayload,
  ShowLeaderboardPayload,
  GameEndedPayload,
} from '@/lib/types'

interface PlayerChannelHandlers {
  onNextQuestion?: (payload: NextQuestionPayload) => void
  onShowLeaderboard?: (payload: ShowLeaderboardPayload) => void
  onGameEnded?: (payload: GameEndedPayload) => void
}

interface PresencePlayer {
  playerId: string
  name: string
  avatar: string | null
}

/**
 * Player-side Realtime channel.
 * Manages exactly ONE WebSocket connection for both Broadcast events and Presence tracking.
 */
export function usePlayerChannel(
  roomCode: string,
  playerInfo: PresencePlayer | null,
  handlers: PlayerChannelHandlers
) {
  const supabase = createClient()
  const handlersRef = useRef(handlers)
  const [subscribed, setSubscribed] = useState(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // Keep handlers ref up-to-date without re-subscribing
  useEffect(() => {
    handlersRef.current = handlers
  })

  useEffect(() => {
    if (!roomCode) return

    const channel = supabase.channel(`room:${roomCode}`, {
      config: { presence: { key: playerInfo?.playerId ?? 'player' } },
    })

    channel
      .on('broadcast', { event: 'NEXT_QUESTION' }, ({ payload }) => {
        handlersRef.current.onNextQuestion?.(payload as NextQuestionPayload)
      })
      .on('broadcast', { event: 'SHOW_LEADERBOARD' }, ({ payload }) => {
        handlersRef.current.onShowLeaderboard?.(payload as ShowLeaderboardPayload)
      })
      .on('broadcast', { event: 'GAME_ENDED' }, ({ payload }) => {
        handlersRef.current.onGameEnded?.(payload as GameEndedPayload)
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setSubscribed(true)
        }
      })

    channelRef.current = channel

    return () => {
      setSubscribed(false)
      supabase.removeChannel(channel)
    }
  }, [roomCode, supabase]) // eslint-disable-line react-hooks/exhaustive-deps

  // Track presence on the single active channel
  useEffect(() => {
    const channel = channelRef.current
    if (subscribed && channel && playerInfo) {
      channel.track(playerInfo)
    }
  }, [subscribed, playerInfo])
}
