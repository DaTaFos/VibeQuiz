'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getPlayerSession, clearPlayerSession, savePlayerSession } from '@/lib/session'
import { usePlayerChannel } from '@/hooks/usePlayerChannel'
import { useServerClock } from '@/hooks/useServerClock'
import JoinForm from '@/components/player/JoinForm'
import AvatarImage from '@/components/AvatarImage'
import AvatarCustomizer from '@/components/player/AvatarCustomizer'
import type {
  NextQuestionPayload,
  ShowLeaderboardPayload,
  GameEndedPayload,
  LeaderboardEntry,
} from '@/lib/types'

type GamePhase = 'loading' | 'not-found' | 'needs-join' | 'lobby' | 'question' | 'answered' | 'reveal' | 'leaderboard' | 'finished'

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
  const [revealPayload, setRevealPayload] = useState<ShowLeaderboardPayload | null>(null)

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

  // Auto-dismiss reveal screen after 4 seconds to transition to the leaderboard
  useEffect(() => {
    if (phase !== 'reveal') return

    const timer = setTimeout(() => {
      if (revealPayload) {
        setLeaderboard(revealPayload.players)
        setSelectedOption(null)
        setAnswerResult(null)
        setPhase('leaderboard')
        setRevealPayload(null)
      }
    }, 4000)

    return () => clearTimeout(timer)
  }, [phase, revealPayload])

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
    setRevealPayload(payload)
    setPhase('reveal')
  }, [])

  const onGameEnded = useCallback((payload: GameEndedPayload) => {
    activeTimerRef.current = null  // stop timer
    setLeaderboard(payload.players)
    setPhase('finished')
  }, [])

  // Manage exactly ONE WebSocket channel for both broadcast events and presence tracking
  const { triggerAnswered } = usePlayerChannel(
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
      triggerAnswered()
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
      <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4 py-8 animate-fade-in">
        <LobbyPlayerPanel
          session={session!}
          roomCode={roomCode}
          onAvatarUpdated={(newAvatar) => {
            setSession((prev) => prev ? { ...prev, avatar: newAvatar } : null)
          }}
        />
      </main>
    )
  }

  if (phase === 'answered') {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="glass-card p-10 text-center flex flex-col items-center justify-center">
            {/* Player avatar */}
            <div className="relative flex items-center justify-center w-24 h-24 rounded-full bg-white/10 border border-white/10 shadow-2xl overflow-hidden mb-6 ring-4 ring-brand-500/10">
              <AvatarImage avatar={session?.avatar ?? null} className="w-20 h-20" />
            </div>

            <h2 className="text-xl font-black text-white mb-1 select-none">Answer Locked In!</h2>
            <p className="text-gray-500 text-sm mb-8 select-none">
              Your answer has been submitted
            </p>

            {/* Pulsing waiting indicator */}
            <div className="flex items-center justify-center gap-2.5 text-brand-400 font-bold">
              <span className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
              <span className="text-sm tracking-wide">Waiting for others to answer…</span>
            </div>
          </div>
        </div>
      </main>
    )
  }

  if (phase === 'reveal') {
    const isCorrect = answerResult?.isCorrect ?? false
    const didAnswer = selectedOption !== null
    const points = answerResult?.points ?? 0

    // Theme values matching state
    let bgGradient = 'from-red-950/40 via-gray-950 to-gray-950'
    let cardBorder = 'border-red-500/20'
    let icon = '❌'
    let titleText = 'INCORRECT'
    let titleColor = 'text-red-400'
    let pointsBadge = 'bg-red-500/10 border-red-500/20 text-red-400'
    let subtext = "Don't worry, you'll get the next one! 💪"

    if (!didAnswer) {
      bgGradient = 'from-amber-950/40 via-gray-950 to-gray-950'
      cardBorder = 'border-amber-500/20'
      icon = '⏰'
      titleText = "TIME'S UP"
      titleColor = 'text-amber-400'
      pointsBadge = 'bg-amber-500/10 border-amber-500/20 text-amber-400'
      subtext = 'Speed up next time to lock in those points! ⚡'
    } else if (isCorrect) {
      bgGradient = 'from-emerald-950/40 via-gray-950 to-gray-950'
      cardBorder = 'border-emerald-500/20'
      icon = '✨'
      titleText = 'CORRECT!'
      titleColor = 'text-emerald-400'
      pointsBadge = 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
      subtext = 'Amazing job! Keep the streak going! 🔥'
    }

    return (
      <main className={`min-h-screen bg-gradient-to-b ${bgGradient} flex flex-col items-center justify-center px-4 py-8 overflow-hidden`}>
        <div className="w-full max-w-sm animate-fade-in relative z-10">
          <div className={`glass-card p-10 text-center flex flex-col items-center justify-center border ${cardBorder} shadow-2xl relative`}>
            {/* Glowing Big State Icon Container */}
            <div className="relative flex items-center justify-center w-24 h-24 rounded-full bg-white/5 border border-white/10 shadow-inner mb-6 animate-bounce-in">
              <span className="text-5xl select-none leading-none">{icon}</span>
            </div>

            <h2 className={`text-4xl font-black tracking-wide ${titleColor} mb-2 select-none`}>
              {titleText}
            </h2>
            <p className="text-gray-400 text-sm mb-6 select-none font-medium px-2">
              {subtext}
            </p>

            {/* Points Awarded Bubble */}
            <div className={`inline-flex items-center gap-1.5 px-6 py-3 rounded-full border ${pointsBadge} font-black tracking-wider text-xl mb-10 shadow-lg scale-105 transition-transform duration-200 select-none`}>
              {isCorrect ? `+${points.toLocaleString()} PTS` : '+0 PTS'}
            </div>

            {/* Loading leaderboard indicator at the bottom */}
            <div className="w-full space-y-2">
              <div className="flex justify-between text-xs text-gray-500 font-semibold tracking-wider select-none">
                <span>LOADING LEADERBOARD</span>
                <span className="animate-pulse">⌛</span>
              </div>
              <div className="h-1 bg-white/10 rounded-full overflow-hidden w-full">
                <div className="h-full bg-brand-500 rounded-full animate-progress" />
              </div>
            </div>
          </div>
        </div>
      </main>
    )
  }

  if (phase === 'question') {
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

        {/* Question Image (Optional) */}
        {q.imageUrl && (
          <div className="relative mb-4 rounded-2xl overflow-hidden border border-white/10 glass-card p-1.5 flex justify-center items-center shadow-xl flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={q.imageUrl}
              alt="Question"
              className="max-h-48 w-full object-contain rounded-xl"
            />
          </div>
        )}

        {/* Question */}
        <div className="glass-card p-6 mb-6 text-center flex-shrink-0">
          <p className="text-xl font-bold leading-snug">{q.text}</p>
        </div>

        {/* Answer buttons */}
        <div className="grid grid-cols-1 gap-3 flex-1">
          {OPTION_LETTERS.map((letter) => {
            const text = q.options[letter]
            const isSelected = selectedOption === letter

            return (
              <button
                key={letter}
                onClick={() => submitAnswer(letter)}
                disabled={!!selectedOption}
                className={`answer-btn ${OPTION_CLASSES[letter]}
                  ${isSelected ? 'answer-btn-selected' : ''}
                  ${!selectedOption ? '' : 'cursor-default'}
                `}
                id={`answer-${letter}`}
              >
                <span className="font-black text-xl">{letter}</span>
                <span className="text-base">{text}</span>
              </button>
            )
          })}
        </div>

        {!selectedOption && (
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
              <AvatarImage avatar={p.avatar} className="w-8 h-8" />
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
              <AvatarImage avatar={p.avatar} className="w-8 h-8" />
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
      {icon && (
        <div className={`flex justify-center mb-4 ${pulse ? 'animate-bounce' : ''}`}>
          <AvatarImage avatar={icon} className="w-16 h-16" />
        </div>
      )}
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

function LobbyPlayerPanel({
  session,
  roomCode,
  onAvatarUpdated,
}: {
  session: { playerId: string; name: string; avatar: string | null }
  roomCode: string
  onAvatarUpdated: (newAvatar: string) => void
}) {
  const [isEditing, setIsEditing] = useState(false)

  return (
    <div className="w-full max-w-md animate-fade-in">
      <div className="glass-card p-8 text-center flex flex-col items-center justify-center relative overflow-hidden group">
        {/* Decorative subtle background pulse */}
        <div className="absolute inset-0 bg-brand-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

        {/* Interactive Avatar Container */}
        <div className="relative mb-6">
          <button
            onClick={() => setIsEditing(true)}
            className="relative flex items-center justify-center w-28 h-28 rounded-full bg-white/10 border-2 border-white/20 hover:border-brand-400 group-hover:scale-105 active:scale-95 transition-all duration-300 shadow-2xl overflow-hidden focus:outline-none cursor-pointer"
            title="Customize Avatar"
          >
            <AvatarImage avatar={session.avatar} className="w-24 h-24" />
            
            {/* Hover overlay indicator */}
            <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity duration-200">
              <span className="text-sm font-bold text-white tracking-wide">✏️ Customize</span>
            </div>
          </button>
        </div>

        <h2 className="text-2xl font-black mb-1 select-none">Hi, {session.name}!</h2>
        <p className="text-gray-400 text-sm mb-8 select-none">Tap your avatar to customize it</p>

        <div className="flex items-center justify-center gap-2 text-brand-400 font-bold">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-brand-400 animate-pulse" />
          <span className="text-sm tracking-wide">Waiting for host to start…</span>
        </div>
      </div>

      {/* Advanced Customizer Overlay */}
      {isEditing && (
        <AvatarCustomizer
          roomCode={roomCode}
          session={session}
          onClose={() => setIsEditing(false)}
          onSave={onAvatarUpdated}
        />
      )}
    </div>
  )
}
