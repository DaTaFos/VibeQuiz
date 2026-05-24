'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getPlayerSession, clearPlayerSession } from '@/lib/session'
import { usePlayerChannel } from '@/hooks/usePlayerChannel'
import { useServerClock } from '@/hooks/useServerClock'
import JoinForm from '@/components/player/JoinForm'
import type {
  NextQuestionPayload,
  ShowLeaderboardPayload,
  GameEndedPayload,
  LeaderboardEntry,
} from '@/lib/types'

type GamePhase = 'loading' | 'not-found' | 'needs-join' | 'lobby' | 'question' | 'answered' | 'leaderboard' | 'finished'

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const
const OPTION_CLASSES = {
  A: 'answer-btn-A',
  B: 'answer-btn-B',
  C: 'answer-btn-C',
  D: 'answer-btn-D',
}

export default function PlayerGame({ roomCode }: { roomCode: string }) {
  const supabase = createClient()

  const [phase, setPhase] = useState<GamePhase>('loading')
  const [session, setSession] = useState<{ playerId: string; name: string; avatar: string | null } | null>(null)
  const [currentQuestion, setCurrentQuestion] = useState<NextQuestionPayload | null>(null)
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [answerResult, setAnswerResult] = useState<{ isCorrect: boolean; points: number } | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [myScore, setMyScore] = useState(0)
  const [timeLeft, setTimeLeft] = useState(0)

  // Wall-clock timer state — stores the active question's timing info
  const activeTimerRef = useRef<{ startedAt: number; timeLimitSeconds: number } | null>(null)
  const { calibrate, correctedNow } = useServerClock()

  // Restore session on mount
  useEffect(() => {
    const stored = getPlayerSession(roomCode)
    if (stored) {
      setSession({ playerId: stored.playerId, name: stored.name, avatar: stored.avatar })
      setPhase('lobby')
    } else {
      setPhase('needs-join')
    }
  }, [roomCode])

  // Wall-clock timer: recompute timeLeft from absolute startedAt every 100ms.
  // Immune to drift, throttling, and tab suspension — always mathematically correct.
  useEffect(() => {
    const id = setInterval(() => {
      const active = activeTimerRef.current
      if (!active) return
      const elapsed = (correctedNow() - active.startedAt) / 1000
      const remaining = Math.max(0, active.timeLimitSeconds - elapsed)
      setTimeLeft(Math.ceil(remaining))
    }, 100)
    return () => clearInterval(id)
  }, [correctedNow])

  const onNextQuestion = useCallback((payload: NextQuestionPayload) => {
    // Calibrate clock offset using server_time from broadcast
    calibrate(payload.serverTime)

    setCurrentQuestion(payload)
    setSelectedOption(null)
    setAnswerResult(null)
    // Arm the wall-clock timer — 100ms interval picks it up immediately
    activeTimerRef.current = {
      startedAt: payload.startedAt,
      timeLimitSeconds: payload.timeLimitSeconds,
    }
    setPhase('question')
  }, [calibrate])

  const onShowLeaderboard = useCallback((payload: ShowLeaderboardPayload) => {
    activeTimerRef.current = null  // stop timer
    setLeaderboard(payload.players)
    setSelectedOption(null)
    setAnswerResult(null)
    setPhase('leaderboard')
  }, [])

  const onGameEnded = useCallback((payload: GameEndedPayload) => {
    activeTimerRef.current = null  // stop timer
    setLeaderboard(payload.players)
    setPhase('finished')
  }, [])

  // Manage exactly ONE WebSocket channel for both broadcast events and presence tracking
  usePlayerChannel(
    roomCode,
    session ? { playerId: session.playerId, name: session.name, avatar: session.avatar } : null,
    { onNextQuestion, onShowLeaderboard, onGameEnded }
  )

  async function submitAnswer(option: typeof OPTION_LETTERS[number]) {
    if (!session || !currentQuestion || selectedOption) return

    // Optimistically lock UI immediately so player can't double-submit
    setSelectedOption(option)

    // Compute response time from the wall clock using the same startedAt reference
    const elapsedMs = correctedNow() - currentQuestion.startedAt
    const responseTimeMs = Math.min(
      Math.max(0, Math.floor(elapsedMs)),
      currentQuestion.timeLimitSeconds * 1000
    )

    const { data } = await supabase.rpc('submit_answer', {
      p_room_code: roomCode,
      p_player_id: session.playerId,
      p_question_id: currentQuestion.questionId,
      p_selected_option: option,
      p_response_time_ms: responseTimeMs,
    })

    if (data?.success) {
      activeTimerRef.current = null  // stop timer only after confirmed
      setAnswerResult({ isCorrect: data.is_correct, points: data.points })
      setMyScore((s) => s + (data.points ?? 0))
      setPhase('answered')
    } else {
      // RPC failed — unlock so player can retry
      setSelectedOption(null)
    }
  }

  // ── Render ────────────────────────────────────────────────

  if (phase === 'loading') {
    return <FullScreenMessage icon="⏳" text="Loading…" />
  }

  if (phase === 'needs-join') {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <p className="text-gray-400">Room</p>
            <div className="text-4xl font-black tracking-widest text-brand-400">{roomCode}</div>
          </div>
          <div className="glass-card p-8">
            <JoinForm prefillCode={roomCode} />
          </div>
        </div>
      </main>
    )
  }

  if (phase === 'lobby') {
    return (
      <FullScreenMessage
        icon={session?.avatar ?? '🎮'}
        title={`Hi, ${session?.name}!`}
        text="Waiting for the host to start the game…"
        sub="Keep this screen open"
        pulse
      />
    )
  }

  if (phase === 'question' || phase === 'answered') {
    const q = currentQuestion!
    const pct = (timeLeft / q.timeLimitSeconds) * 100
    const barColor = pct > 50 ? 'bg-green-500' : pct > 20 ? 'bg-yellow-400' : 'bg-red-500'

    return (
      <main className="min-h-screen bg-gray-950 flex flex-col px-4 py-6">
        {/* Timer */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5 text-sm">
            <span className="text-gray-400">Q{q.questionIndex}</span>
            <span className={`font-bold tabular-nums ${timeLeft <= 5 ? 'text-red-400 animate-pulse' : 'text-white'}`}>
              {timeLeft}s
            </span>
          </div>
          <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${barColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Question */}
        <div className="glass-card p-6 mb-6 text-center flex-shrink-0">
          <p className="text-xl font-bold leading-snug">{q.text}</p>
        </div>

        {/* Answer buttons */}
        <div className="grid grid-cols-1 gap-3 flex-1">
          {OPTION_LETTERS.map((letter) => {
            const text = q.options[letter]
            const isSelected = selectedOption === letter
            const isCorrect = phase === 'answered' && answerResult?.isCorrect && isSelected
            const isWrong = phase === 'answered' && !answerResult?.isCorrect && isSelected

            return (
              <button
                key={letter}
                onClick={() => submitAnswer(letter)}
                disabled={!!selectedOption}
                className={`answer-btn ${OPTION_CLASSES[letter]}
                  ${isSelected ? 'answer-btn-selected' : ''}
                  ${isCorrect ? 'answer-btn-correct' : ''}
                  ${isWrong ? 'answer-btn-incorrect' : ''}
                  ${!selectedOption ? '' : 'cursor-default'}
                `}
                id={`answer-${letter}`}
              >
                <span className="font-black text-xl">{letter}</span>
                <span className="text-base">{text}</span>
                {isCorrect && <span className="ml-auto text-xl">✓</span>}
                {isWrong && <span className="ml-auto text-xl">✗</span>}
              </button>
            )
          })}
        </div>

        {/* Result feedback */}
        {phase === 'answered' && answerResult && (
          <div className={`mt-4 text-center py-4 rounded-2xl font-bold text-lg animate-bounce-in
            ${answerResult.isCorrect ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
            {answerResult.isCorrect
              ? `✓ Correct! +${answerResult.points} pts`
              : '✗ Wrong answer'}
            <div className="text-sm font-normal text-gray-400 mt-1">
              Waiting for next question…
            </div>
          </div>
        )}

        {phase === 'question' && !selectedOption && (
          <div className="mt-4 text-center text-gray-500 text-sm">Tap an answer</div>
        )}
      </main>
    )
  }

  if (phase === 'leaderboard') {
    const RANK = ['🥇', '🥈', '🥉']
    const myEntry = leaderboard.find((p) => p.name === session?.name)

    return (
      <main className="min-h-screen bg-gray-950 px-4 py-8 animate-fade-in">
        <h2 className="text-2xl font-black text-center mb-2">Leaderboard</h2>
        <p className="text-gray-400 text-center text-sm mb-6">
          Your score: <span className="text-brand-400 font-bold">{myScore.toLocaleString()}</span>
        </p>

        <div className="space-y-3 mb-6">
          {leaderboard.slice(0, 5).map((p, i) => (
            <div
              key={p.name}
              className={`glass-card px-4 py-3 flex items-center gap-3 ${p.name === session?.name ? 'ring-1 ring-brand-400' : ''}`}
            >
              <span className="text-xl w-7 text-center">{i < 3 ? RANK[i] : `#${i + 1}`}</span>
              <span className="text-xl">{p.avatar ?? '😶'}</span>
              <span className="flex-1 font-semibold truncate">{p.name}</span>
              <span className="font-black text-brand-300">{p.total_score.toLocaleString()}</span>
            </div>
          ))}
        </div>

        <FullScreenMessage icon="⏳" text="Waiting for next question…" inline />
      </main>
    )
  }

  // Finished
  const myFinalEntry = leaderboard.find((p) => p.name === session?.name)
  const myRank = myFinalEntry?.rank ?? '-'

  return (
    <main className="min-h-screen bg-gray-950 px-4 py-8 text-center animate-fade-in">
      <div className="text-6xl mb-4">🏆</div>
      <h1 className="text-3xl font-black mb-1">Game Over!</h1>
      <p className="text-gray-400 mb-6">
        You finished #{myRank} with <span className="text-brand-400 font-bold">{myScore.toLocaleString()}</span> pts
      </p>

      <div className="space-y-3 mb-8">
        {leaderboard.slice(0, 5).map((p, i) => {
          const RANK = ['🥇', '🥈', '🥉']
          return (
            <div key={p.name} className={`glass-card px-4 py-3 flex items-center gap-3 ${p.name === session?.name ? 'ring-1 ring-brand-400' : ''}`}>
              <span className="text-xl w-7 text-center">{i < 3 ? RANK[i] : `#${i + 1}`}</span>
              <span className="text-xl">{p.avatar ?? '😶'}</span>
              <span className="flex-1 font-semibold truncate">{p.name}</span>
              <span className="font-black text-brand-300">{p.total_score.toLocaleString()}</span>
            </div>
          )
        })}
      </div>

      <a href="/play" className="btn-primary inline-block" onClick={() => clearPlayerSession(roomCode)}>
        Play Again
      </a>
    </main>
  )
}

// ── Helpers ──────────────────────────────────────────────────

function FullScreenMessage({
  icon, title, text, sub, pulse, inline,
}: {
  icon?: string
  title?: string
  text: string
  sub?: string
  pulse?: boolean
  inline?: boolean
}) {
  const inner = (
    <div className="text-center animate-fade-in">
      {icon && <div className={`text-5xl mb-4 ${pulse ? 'animate-bounce' : ''}`}>{icon}</div>}
      {title && <h2 className="text-xl font-bold mb-2">{title}</h2>}
      <p className="text-gray-400">{text}</p>
      {sub && <p className="text-gray-600 text-sm mt-2">{sub}</p>}
    </div>
  )

  if (inline) return inner

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      {inner}
    </main>
  )
}
