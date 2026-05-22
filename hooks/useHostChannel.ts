'use client'

import { useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { BroadcastPayload, LeaderboardEntry } from '@/lib/types'

/**
 * Host-side Realtime channel.
 * Sends broadcast events to all players in the room.
 */
export function useHostChannel(roomCode: string) {
  const supabase = createClient()
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => {
    if (!roomCode) return

    const channel = supabase.channel(`room:${roomCode}`, {
      config: { broadcast: { self: false } },
    })

    channel.subscribe()
    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomCode, supabase])

  const broadcast = useCallback(
    async (payload: BroadcastPayload) => {
      if (!channelRef.current) return
      await channelRef.current.send({
        type: 'broadcast',
        event: payload.type,
        payload,
      })
    },
    []
  )

  const broadcastNextQuestion = useCallback(
    async (payload: Omit<BroadcastPayload & { type: 'NEXT_QUESTION' }, 'type'>) => {
      await broadcast({ type: 'NEXT_QUESTION', ...payload } as BroadcastPayload)
    },
    [broadcast]
  )

  const broadcastLeaderboard = useCallback(
    async (players: LeaderboardEntry[], questionIndex: number, questionResults?: object) => {
      await broadcast({
        type: 'SHOW_LEADERBOARD',
        players,
        questionIndex,
        questionResults: questionResults as any,
      })
    },
    [broadcast]
  )

  const broadcastGameEnded = useCallback(
    async (players: LeaderboardEntry[]) => {
      await broadcast({ type: 'GAME_ENDED', players })
    },
    [broadcast]
  )

  return { broadcastNextQuestion, broadcastLeaderboard, broadcastGameEnded }
}
