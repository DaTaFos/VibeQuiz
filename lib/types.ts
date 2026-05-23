/** Shared TypeScript types mirroring the DB schema */

export type RoomStatus = 'lobby' | 'active' | 'finished'

export interface Quiz {
  id: string
  host_id: string
  title: string
  description: string | null
  created_at: string
  updated_at: string
}

export interface Question {
  id: string
  quiz_id: string
  position: number
  text: string
  time_limit: number
  max_points: number
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  // correct_option intentionally omitted — server-side only
}

export interface Room {
  id: string
  room_code: string
  quiz_id: string
  host_id: string
  status: RoomStatus
  current_question: number
  started_at: string | null
  ended_at: string | null
  created_at: string
}

export interface Player {
  id: string
  room_id: string
  name: string
  avatar: string | null
  total_score: number
  joined_at: string
}

export interface LeaderboardEntry {
  name: string
  avatar: string | null
  total_score: number
  rank: number
}

// Realtime broadcast event payloads
export interface NextQuestionPayload {
  type: 'NEXT_QUESTION'
  questionIndex: number
  questionId: string
  text: string
  options: { A: string; B: string; C: string; D: string }
  timeLimitSeconds: number
  startedAt: number  // unix ms — when the question timer started
  serverTime: number // unix ms — server wall clock at broadcast time (for offset calibration)
}

export interface ShowLeaderboardPayload {
  type: 'SHOW_LEADERBOARD'
  players: LeaderboardEntry[]
  questionIndex: number
  questionResults?: {
    correct_option: string
    total_responses: number
    correct_count: number
    distribution: { A: number; B: number; C: number; D: number }
  }
}

export interface GameEndedPayload {
  type: 'GAME_ENDED'
  players: LeaderboardEntry[]
}

export type BroadcastPayload =
  | NextQuestionPayload
  | ShowLeaderboardPayload
  | GameEndedPayload
