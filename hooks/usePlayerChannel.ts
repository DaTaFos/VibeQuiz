'use client'

import { useEffect, useRef } from 'react'
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

/**
 * Player-side Realtime channel.
 * Subscribes to broadcast events from the host.
 */
export function usePlayerChannel(roomCode: string, handlers: PlayerChannelHandlers) {
  const supabase = createClient()
  const handlersRef = useRef(handlers)

  // Keep handlers ref up-to-date without re-subscribing
  useEffect(() => {
    handlersRef.current = handlers
  })

  useEffect(() => {
    if (!roomCode) return

    const channel = supabase
      .channel(`room:${roomCode}`)
      .on('broadcast', { event: 'NEXT_QUESTION' }, ({ payload }) => {
        handlersRef.current.onNextQuestion?.(payload as NextQuestionPayload)
      })
      .on('broadcast', { event: 'SHOW_LEADERBOARD' }, ({ payload }) => {
        handlersRef.current.onShowLeaderboard?.(payload as ShowLeaderboardPayload)
      })
      .on('broadcast', { event: 'GAME_ENDED' }, ({ payload }) => {
        handlersRef.current.onGameEnded?.(payload as GameEndedPayload)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomCode, supabase])
}
