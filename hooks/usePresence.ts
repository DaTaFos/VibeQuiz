'use client'

import { useEffect, useState, useRef } from 'react'
import { getPusherClient } from '@/lib/pusher'

export interface PresencePlayer {
  name: string
  avatar: string | null
  playerId: string
}

/**
 * Presence hook for the lobby player list.
 * Host subscribes to see who joins; players track their own presence.
 */
export function usePresence(
  roomCode: string,
  playerInfo?: PresencePlayer,
  onPlayerAnswered?: (playerId: string) => void
) {
  const [players, setPlayers] = useState<PresencePlayer[]>([])
  const onPlayerAnsweredRef = useRef(onPlayerAnswered)

  useEffect(() => {
    onPlayerAnsweredRef.current = onPlayerAnswered
  })

  useEffect(() => {
    if (!roomCode) return

    // Initialize Pusher with playerInfo if it's a player, or default 'host' info if it's the host
    const info = playerInfo || { playerId: 'host', name: 'Host', avatar: null }
    const pusher = getPusherClient(info)
    const channelName = `presence-room-${roomCode}`

    const channel = pusher.subscribe(channelName) as any

    const updatePlayersList = () => {
      const list: PresencePlayer[] = []
      channel.members.each((member: any) => {
        // Exclude the host from the player list
        if (member.id !== 'host') {
          list.push({
            playerId: member.info.playerId,
            name: member.info.name,
            avatar: member.info.avatar,
          })
        }
      })
      setPlayers(list)
    }

    channel.bind('pusher:subscription_succeeded', () => {
      updatePlayersList()
    })

    channel.bind('pusher:member_added', () => {
      updatePlayersList()
    })

    channel.bind('pusher:member_removed', () => {
      updatePlayersList()
    })

    channel.bind('PLAYER_ANSWERED', (data: { playerId: string }) => {
      onPlayerAnsweredRef.current?.(data.playerId)
    })

    channel.bind('PLAYER_AVATAR_CHANGED', (data: { playerId: string; avatar: string }) => {
      setPlayers((prev) =>
        prev.map((p) => (p.playerId === data.playerId ? { ...p, avatar: data.avatar } : p))
      )
    })

    return () => {
      channel.unbind_all()
      pusher.unsubscribe(channelName)
      pusher.disconnect()
    }
  }, [roomCode, playerInfo?.playerId, playerInfo?.name, playerInfo?.avatar]) // eslint-disable-line react-hooks/exhaustive-deps

  return { players }
}
