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
  const subscribedRef = useRef(false)

  useEffect(() => {
    if (!roomCode) return

    const channel = supabase.channel(`room:${roomCode}`, {
      config: { broadcast: { self: false } },
    })

    channel.subscribe((status) => {
      subscribedRef.current = status === 'SUBSCRIBED'
    })
    channelRef.current = channel

    return () => {
      subscribedRef.current = false
      supabase.removeChannel(channel)
    }
  }, [roomCode, supabase])

  const broadcast = useCallback(
    async (payload: BroadcastPayload) => {
      const ch = channelRef.current
      if (!ch) return

      // Wait up to 3 seconds for channel to be subscribed before sending
      if (!subscribedRef.current) {
        await new Promise<void>((resolve) => {
          const start = Date.now()
          const poll = setInterval(() => {
            if (subscribedRef.current || Date.now() - start > 3000) {
              clearInterval(poll)
              resolve()
            }
          }, 50)
        })
      }

      await ch.send({
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
