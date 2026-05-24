'use client'

import { useEffect, useRef } from 'react'
import { getPusherClient } from '@/lib/pusher'
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
 * Subscribes to Pusher/Soketi for Broadcast events and Presence tracking.
 * Keyed on primitive values to avoid reconnecting on every parent render.
 */
export function usePlayerChannel(
  roomCode: string,
  playerInfo: PresencePlayer | null,
  handlers: PlayerChannelHandlers
) {
  const handlersRef = useRef(handlers)
  const playerInfoRef = useRef(playerInfo)

  // Keep refs up-to-date without triggering re-subscription
  useEffect(() => {
    handlersRef.current = handlers
  })
  useEffect(() => {
    playerInfoRef.current = playerInfo
  })

  // Only re-subscribe when primitive identity values change
  const playerId = playerInfo?.playerId ?? null
  const playerName = playerInfo?.name ?? null
  const playerAvatar = playerInfo?.avatar ?? null

  useEffect(() => {
    if (!roomCode || !playerId || !playerName) return

    const info = playerInfoRef.current!
    const pusher = getPusherClient(info)
    const channelName = `presence-room-${roomCode}`

    const channel = pusher.subscribe(channelName)

    channel.bind('pusher:subscription_error', (status: any) => {
      console.error('Pusher subscription error:', status)
    })

    channel.bind('NEXT_QUESTION', (data: NextQuestionPayload) => {
      handlersRef.current.onNextQuestion?.(data)
    })

    channel.bind('SHOW_LEADERBOARD', (data: ShowLeaderboardPayload) => {
      handlersRef.current.onShowLeaderboard?.(data)
    })

    channel.bind('GAME_ENDED', (data: GameEndedPayload) => {
      handlersRef.current.onGameEnded?.(data)
    })

    return () => {
      channel.unbind_all()
      pusher.unsubscribe(channelName)
      pusher.disconnect()
    }
  }, [roomCode, playerId, playerName, playerAvatar]) // eslint-disable-line react-hooks/exhaustive-deps
}
