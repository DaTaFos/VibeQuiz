'use client'

import { useCallback } from 'react'
import type { BroadcastPayload, LeaderboardEntry } from '@/lib/types'

/**
 * Host-side Realtime channel.
 * Sends broadcast events to all players in the room via /api/broadcast.
 */
export function useHostChannel(roomCode: string) {
  const broadcast = useCallback(
    async (payload: BroadcastPayload) => {
      if (!roomCode) return
      
      try {
        await fetch('/api/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomCode, payload }),
        })
      } catch (error) {
        console.error('Failed to broadcast via Soketi:', error)
      }
    },
    [roomCode]
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
