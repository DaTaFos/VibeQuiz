/** Player session stored in localStorage, keyed by room code */
export const SESSION_KEY_PREFIX = 'vq_session_'

export interface PlayerSession {
  playerId: string
  roomCode: string
  name: string
  avatar: string | null
}

export function getPlayerSession(roomCode: string): PlayerSession | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(SESSION_KEY_PREFIX + roomCode)
  if (!raw) return null
  try {
    return JSON.parse(raw) as PlayerSession
  } catch {
    return null
  }
}

export function savePlayerSession(session: PlayerSession): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(
    SESSION_KEY_PREFIX + session.roomCode,
    JSON.stringify(session)
  )
}

export function clearPlayerSession(roomCode: string): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(SESSION_KEY_PREFIX + roomCode)
}
