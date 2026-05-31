'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePresence } from '@/hooks/usePresence'
import { useHostChannel } from '@/hooks/useHostChannel'
import type { Question, LeaderboardEntry, Room } from '@/lib/types'
import AvatarImage from '@/components/AvatarImage'

type GamePhase = 'lobby' | 'question' | 'leaderboard' | 'finished'

interface HostGameProps {
  initialRoom: Room
  questions: Question[]
}

export default function HostGame({ initialRoom, questions }: HostGameProps) {
  const supabase = createClient()
  const [room, setRoom] = useState(initialRoom)
  const [phase, setPhase] = useState<GamePhase>('lobby')
  const [currentQ, setCurrentQ] = useState(0) // 0-indexed into questions array
  const [timeLeft, setTimeLeft] = useState(0)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [questionResults, setQuestionResults] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [answeredIds, setAnsweredIds] = useState<string[]>([])

  // Wall-clock timer — stores the active question's timing reference
  const activeTimerRef = useRef<{ startedAt: number; timeLimitSeconds: number } | null>(null)
  const phaseRef = useRef(phase)  // stable ref so timer callback can read latest phase
  const loadingRef = useRef(loading)

  const handlePlayerAnswered = useCallback((playerId: string) => {
    setAnsweredIds((prev) => {
      if (prev.includes(playerId)) return prev
      return [...prev, playerId]
    })
  }, [])

  const { players } = usePresence(room.room_code, undefined, handlePlayerAnswered)
  const { broadcastNextQuestion, broadcastLeaderboard, broadcastGameEnded } =
    useHostChannel(room.room_code)

  // Auto-advance if 100% of active players have answered the question
  useEffect(() => {
    if (
      phase === 'question' &&
      players.length > 0 &&
      answeredIds.length >= players.length &&
      !loading
    ) {
      handleNext()
    }
  }, [answeredIds, players.length, phase, loading, handleNext])

  // Keep refs in sync with state
  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { loadingRef.current = loading }, [loading])

  // Wall-clock timer: recompute timeLeft from absolute startedAt every 100ms.
  // When it hits 0, auto-advance to results (same as jovVix pattern).
  useEffect(() => {
    const id = setInterval(() => {
      const active = activeTimerRef.current
      if (!active) return
      const elapsed = (Date.now() - active.startedAt) / 1000
      const remaining = Math.max(0, active.timeLimitSeconds - elapsed)
      setTimeLeft(Math.ceil(remaining))
      // Auto-advance when timer expires and we're still in question phase
      if (remaining <= 0 && phaseRef.current === 'question' && !loadingRef.current) {
        activeTimerRef.current = null
        handleNext()
      }
    }, 100)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchLeaderboard() {
    const { data } = await supabase.rpc('get_leaderboard', {
      p_room_code: room.room_code,
      p_limit: 10,
    })
    if (data?.success) setLeaderboard(data.players ?? [])
    return data?.players ?? []
  }

  async function fetchQuestionResults(questionId: string) {
    const { data } = await supabase.rpc('get_question_results', {
      p_room_code: room.room_code,
      p_question_id: questionId,
    })
    if (data?.success) setQuestionResults(data.results)
    return data?.results
  }

  async function startGame() {
    setLoading(true)
    const { data } = await supabase.rpc('start_game', { p_room_code: room.room_code })
    if (data?.success) {
      setRoom((r) => ({ ...r, status: 'active', current_question: 1 }))
      await sendQuestion(0)
    }
    setLoading(false)
  }

  async function sendQuestion(idx: number) {
    const q = questions[idx]
    if (!q) return

    setCurrentQ(idx)
    setPhase('question')
    setTimeLeft(q.time_limit)
    setQuestionResults(null)
    setAnsweredIds([])
    activeTimerRef.current = null  // disarm while waiting for broadcast

    const startedAt = Date.now()
    await broadcastNextQuestion({
      questionIndex: idx + 1,
      questionId: q.id,
      text: q.text,
      options: { A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d },
      timeLimitSeconds: q.time_limit,
      startedAt,
      serverTime: startedAt,
      imageUrl: q.image_url,
    })

    // Arm timer after broadcast — host and player both start from the same startedAt
    activeTimerRef.current = { startedAt, timeLimitSeconds: q.time_limit }
  }

  async function handleNext() {
    if (loading) return   // guard against double-call (auto-advance + button click)
    setLoading(true)
    activeTimerRef.current = null  // stop timer

    const q = questions[currentQ]

    // Fetch both in parallel; broadcast as soon as leaderboard arrives so players
    // transition immediately — don't gate on question results finishing.
    const [results, lb] = await Promise.all([
      fetchQuestionResults(q.id),
      fetchLeaderboard(),
    ])

    setPhase('leaderboard')
    await broadcastLeaderboard(lb, currentQ + 1, results)
    setLoading(false)
  }

  async function handleNextQuestion() {
    const nextIdx = currentQ + 1
    if (nextIdx >= questions.length) {
      // No more questions — end game
      await handleEndGame()
      return
    }

    // Must await so DB current_question is updated before players can submit answers
    await supabase.rpc('advance_question', { p_room_code: room.room_code })
    await sendQuestion(nextIdx)
  }

  async function handleEndGame() {
    setLoading(true)
    const lb = await fetchLeaderboard()
    await supabase.rpc('end_game', { p_room_code: room.room_code })
    await broadcastGameEnded(lb)
    setLeaderboard(lb)
    setPhase('finished')
    setLoading(false)
  }

  if (phase === 'lobby') {
    return (
      <LobbyView
        room={room}
        players={players}
        questionCount={questions.length}
        onStart={startGame}
        loading={loading}
      />
    )
  }

  if (phase === 'question') {
    const q = questions[currentQ]
    return (
      <QuestionView
        question={q}
        questionNumber={currentQ + 1}
        total={questions.length}
        timeLeft={timeLeft}
        onNext={handleNext}
        loading={loading}
        answeredCount={answeredIds.length}
        totalPlayers={players.length}
      />
    )
  }

  if (phase === 'leaderboard') {
    const isLast = currentQ >= questions.length - 1
    return (
      <LeaderboardView
        players={leaderboard}
        questionResults={questionResults}
        questions={questions}
        currentQ={currentQ}
        isFinal={false}
        onNext={isLast ? handleEndGame : handleNextQuestion}
        nextLabel={isLast ? '🏁 End Game' : `▶ Question ${currentQ + 2}`}
        loading={loading}
      />
    )
  }

  // Finished
  return (
    <LeaderboardView
      players={leaderboard}
      questionResults={null}
      questions={questions}
      currentQ={currentQ}
      isFinal={true}
      onNext={() => { }}
      nextLabel=""
      loading={false}
    />
  )
}

// ── Sub-views ────────────────────────────────────────────────

function LobbyView({
  room, players, questionCount, onStart, loading,
}: {
  room: Room
  players: any[]
  questionCount: number
  onStart: () => void
  loading: boolean
}) {
  const [origin, setOrigin] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const joinUrl = origin ? `${origin}/play?code=${room.room_code}` : ''
  const qrCodeUrl = joinUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(joinUrl)}&color=6366f1&bgcolor=ffffff&qzone=2`
    : ''

  const handleCopyLink = () => {
    if (navigator.clipboard && joinUrl) {
      navigator.clipboard.writeText(joinUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 animate-fade-in flex flex-col min-h-[85vh] justify-center">
      {/* Title */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-black text-white mb-2">VibeQuiz Lobby</h1>
        <p className="text-gray-400 text-sm">Players are arriving... get ready to battle!</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-stretch mb-8">
        {/* LEFT COLUMN: JOIN INFORMATION & QR CODE */}
        <div className="md:col-span-7 flex flex-col justify-between glass-card p-8 relative overflow-hidden select-none">
          <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/10 rounded-full blur-2xl pointer-events-none" />

          <div className="flex flex-col items-center justify-center text-center flex-1 py-6">
            <span className="text-xs font-black tracking-widest text-brand-400 uppercase mb-2">Room Code</span>
            <div className="text-7xl md:text-8xl font-black tracking-[0.15em] pl-[0.15em] bg-gradient-to-r from-brand-400 to-purple-400 bg-clip-text text-transparent animate-pulse-glow">
              {room.room_code}
            </div>
            <p className="text-gray-400 text-xs mt-2 uppercase tracking-wider font-semibold">
              Enter this code on the play screen or scan the QR below
            </p>
          </div>


          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 bg-white/[0.02] border border-white/5 rounded-2xl p-6 mt-4">
            <div className="flex-1 text-center sm:text-left">
              <h3 className="font-bold text-white text-lg mb-1">⚡ Scan to Join</h3>
              <p className="text-gray-400 text-sm leading-relaxed mb-4">
                Scan the QR code with your mobile device to join instantly with the room code auto-filled!
              </p>

              <button
                type="button"
                onClick={handleCopyLink}
                className="btn-secondary text-xs px-4 py-2 flex items-center gap-1.5 active:scale-95 transition-all select-none"
              >
                <span>{copied ? '✅ Copied!' : '🔗 Copy Join Link'}</span>
              </button>
            </div>

            {/* Premium QR Code Image Container */}
            <div className="w-40 h-40 bg-white p-3 rounded-2xl flex items-center justify-center shadow-2xl relative group overflow-hidden border border-white/10 shrink-0 select-none animate-bounce-in">
              {qrCodeUrl ? (
                <img
                  src={qrCodeUrl}
                  alt="Join Game QR Code"
                  className="w-full h-full object-contain"
                  draggable={false}
                />
              ) : (
                <div className="w-full h-full bg-gray-100 animate-pulse rounded-lg" />
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: PLAYERS JOINED LIST */}
        <div className="md:col-span-5 glass-card p-8 flex flex-col justify-between select-none relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />

          <div>
            <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
              <h2 className="font-black text-xl text-white tracking-wide">Players</h2>
              <span className="text-3xl font-extrabold text-brand-400 animate-pulse">{players.length}</span>
            </div>

            <div className="flex flex-wrap gap-2.5 max-h-[320px] overflow-y-auto pr-1">
              {players.map((p) => (
                <div key={p.playerId} className="flex items-center gap-2.5 bg-white/5 border border-white/10 rounded-full pl-2 pr-4 py-2 text-sm hover:border-white/20 transition-all select-none animate-bounce-in">
                  <AvatarImage avatar={p.avatar} className="w-6 h-6" />
                  <span className="font-semibold text-gray-200">{p.name}</span>
                </div>
              ))}
              {players.length === 0 && (
                <div className="w-full py-16 flex flex-col items-center justify-center text-center text-gray-500">
                  <span className="text-4xl mb-3 animate-bounce">⏳</span>
                  <p className="text-sm font-semibold">Waiting for players to join…</p>
                  <p className="text-xs text-gray-600 mt-1">Ready to sync in real-time</p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 pt-4 border-t border-white/10 flex items-center justify-between text-xs text-gray-500 font-semibold">
            <span>Room Status: Lobby</span>
            <span>{questionCount} Questions</span>
          </div>
        </div>
      </div>

      {/* START ACTION PANEL */}
      <div className="glass-card p-6 flex flex-col sm:flex-row items-center justify-between gap-4 select-none">
        <div className="text-center sm:text-left">
          <span className="text-xs text-gray-500 uppercase tracking-widest font-black">Host Controls</span>
          <h2 className="text-white font-bold text-lg">Ready to launch?</h2>
        </div>

        <div className="w-full sm:w-auto">
          <button
            onClick={onStart}
            disabled={loading || players.length === 0}
            className="btn-primary text-lg px-12 py-4 w-full sm:w-auto font-bold flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg hover:shadow-brand-500/25"
            id="start-game-btn"
          >
            {loading ? 'Starting…' : '🚀 Start Game'}
          </button>
          {players.length === 0 && (
            <p className="text-gray-500 text-center sm:text-right text-xs mt-1.5 font-semibold">
              At least 1 player must join to start
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function QuestionView({
  question, questionNumber, total, timeLeft, onNext, loading, answeredCount, totalPlayers,
}: {
  question: Question
  questionNumber: number
  total: number
  timeLeft: number
  onNext: () => void
  loading: boolean
  answeredCount: number
  totalPlayers: number
}) {
  const pct = (timeLeft / question.time_limit) * 100
  const barColor = pct > 50 ? 'bg-green-500' : pct > 20 ? 'bg-yellow-400' : 'bg-red-500'

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <span className="text-gray-400 text-sm">Question {questionNumber} / {total}</span>
        <span className={`text-2xl font-black tabular-nums ${timeLeft <= 5 ? 'text-red-400 animate-pulse' : 'text-white'}`}>
          {timeLeft}s
        </span>
      </div>

      {/* Timer bar */}
      <div className="h-2 bg-white/10 rounded-full mb-8 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Question Image (Optional) */}
      {question.image_url && (
        <div className="relative mb-6 rounded-2xl overflow-hidden border border-white/10 glass-card p-2 flex justify-center items-center shadow-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={question.image_url}
            alt="Question"
            className="max-h-72 w-full object-contain rounded-xl"
          />
        </div>
      )}

      <div className="glass-card p-8 mb-8 text-center">
        <p className="text-2xl font-bold leading-snug">{question.text}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-8 opacity-60">
        {(['A', 'B', 'C', 'D'] as const).map((letter, i) => {
          const text = [question.option_a, question.option_b, question.option_c, question.option_d][i]
          return (
            <div key={letter} className={`answer-btn answer-btn-${letter} cursor-default`}>
              <span className="font-black text-white/70">{letter}</span>
              <span className="text-sm">{text}</span>
            </div>
          )
        })}
      </div>

      {/* Answered counter: Simple Fraction with Pop Up animation */}
      <div className="glass-card p-6 mb-8 text-center flex flex-col items-center justify-center">
        <div className="text-sm text-gray-400 font-medium mb-1">Players Answered</div>
        <div className="text-4xl font-extrabold flex items-center gap-2">
          <span key={answeredCount} className="inline-block animate-pop text-brand-400 text-5xl">
            {answeredCount}
          </span>
          <span className="text-gray-500">/</span>
          <span className="text-white text-3xl">{totalPlayers}</span>
        </div>
      </div>

      <button
        onClick={onNext}
        disabled={loading}
        className="btn-primary w-full text-lg py-4"
        id="host-next-btn"
      >
        {loading ? 'Loading results…' : '📊 Show Results'}
      </button>
    </div>
  )
}

function LeaderboardView({
  players, questionResults, questions, currentQ, isFinal, onNext, nextLabel, loading,
}: {
  players: LeaderboardEntry[]
  questionResults: any
  questions: Question[]
  currentQ: number
  isFinal: boolean
  onNext: () => void
  nextLabel: string
  loading: boolean
}) {
  const RANK_STYLES = ['🥇', '🥈', '🥉']
  const OPTION_LABELS = ['A', 'B', 'C', 'D']

  const [revealStep, setRevealStep] = useState(0)

  // Staggered sequential reveals based dynamically on player count to avoid blank delays
  useEffect(() => {
    if (!isFinal) return

    const count = players.length
    let t1: NodeJS.Timeout | undefined
    let t2: NodeJS.Timeout | undefined
    let t3: NodeJS.Timeout | undefined
    let t4: NodeJS.Timeout | undefined

    if (count === 1) {
      // 1 Player: Skip 3rd & 2nd place. Reveal 1st place after 1.0s, show actions after 2.0s (1s after 1st)
      t3 = setTimeout(() => setRevealStep(3), 1000)
      t4 = setTimeout(() => setRevealStep(4), 2000)
    } else if (count === 2) {
      // 2 Players: Skip 3rd place. Reveal 2nd place after 1.0s, 1st place after 3.0s (2s gap), actions after 4.0s (1s after 1st)
      t2 = setTimeout(() => setRevealStep(2), 1000)
      t3 = setTimeout(() => setRevealStep(3), 3000)
      t4 = setTimeout(() => setRevealStep(4), 4000)
    } else {
      // 3+ Players: Reveal 3rd after 1.0s, 2nd after 3.0s (2s gap), 1st after 5.0s (2s gap), actions after 6.0s (1s after 1st)
      t1 = setTimeout(() => setRevealStep(1), 1000)
      t2 = setTimeout(() => setRevealStep(2), 3000)
      t3 = setTimeout(() => setRevealStep(3), 5000)
      t4 = setTimeout(() => setRevealStep(4), 6000)
    }

    return () => {
      if (t1) clearTimeout(t1)
      if (t2) clearTimeout(t2)
      if (t3) clearTimeout(t3)
      if (t4) clearTimeout(t4)
    }
  }, [isFinal, players.length])

  // Podium partitions
  const podiumPlayers = isFinal ? players.slice(0, 3) : []
  const runnerUpPlayers = isFinal ? players.slice(3, 10) : players.slice(0, 10)

  // Podium positions ordering: 2nd, 1st, 3rd from left to right
  const podiumOrder = [
    { place: 2, index: 1, height: 'h-40 sm:h-44', border: 'border-slate-300/30', bg: 'bg-slate-300/[0.03]', shadow: 'shadow-slate-300/5 shadow-2xl', text: 'text-slate-300', icon: '🥈', delay: '0ms' },
    { place: 1, index: 0, height: 'h-52 sm:h-56', border: 'border-yellow-400/60 ring-2 ring-yellow-400/20', bg: 'bg-yellow-400/[0.06]', shadow: 'shadow-yellow-500/25 shadow-2xl animate-pulse', text: 'text-yellow-400', icon: '👑', delay: '0ms' },
    { place: 3, index: 2, height: 'h-32 sm:h-36', border: 'border-amber-600/30', bg: 'bg-amber-600/[0.03]', shadow: 'shadow-amber-600/5 shadow-2xl', text: 'text-amber-600', icon: '🥉', delay: '0ms' },
  ]

  return (
    <div className={`mx-auto px-4 py-10 animate-fade-in ${isFinal ? 'max-w-4xl' : 'max-w-2xl'}`}>
      <h2 className="text-3xl font-black text-center mb-2">
        {isFinal ? '🏆 Final Results' : '📊 Leaderboard'}
      </h2>
      {!isFinal && <p className="text-gray-400 text-center text-sm mb-8">After question {currentQ + 1}</p>}

      {/* Answer distribution */}
      {questionResults && !isFinal && (
        <div className="glass-card p-5 mb-6">
          <p className="text-sm font-medium text-gray-300 mb-3">Answer Distribution</p>
          <div className="grid grid-cols-4 gap-2">
            {OPTION_LABELS.map((letter) => {
              const count = questionResults.distribution?.[letter] ?? 0
              const total = questionResults.total_responses || 1
              const pct = Math.round((count / total) * 100)
              const isCorrect = letter === questionResults.correct_option
              return (
                <div key={letter} className={`rounded-lg p-3 text-center ${isCorrect ? 'bg-green-500/20 border border-green-500/40' : 'bg-white/5'}`}>
                  <div className={`text-lg font-bold ${isCorrect ? 'text-green-400' : 'text-gray-300'}`}>{letter}</div>
                  <div className="text-xl font-black">{count}</div>
                  <div className="text-xs text-gray-400">{pct}%</div>
                  {isCorrect && <div className="text-xs text-green-400 mt-1">✓ correct</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Premium 3D Podium for Final Game Over Screen */}
      {isFinal && players.length > 0 && (
        <div className="flex justify-center items-end gap-3 sm:gap-6 mb-12 mt-6 h-96">
          {podiumOrder.map((pos) => {
            const p = podiumPlayers[pos.index]

            // Only render podium columns if there are players to go in them
            if (!p && pos.index >= players.length) return null

            // Suspense reveal steps filtering
            if (pos.place === 3 && revealStep < 1) return <div key={pos.place} className="w-24 sm:w-36 flex flex-col items-center justify-end h-full" />
            if (pos.place === 2 && revealStep < 2) return <div key={pos.place} className="w-24 sm:w-36 flex flex-col items-center justify-end h-full" />
            if (pos.place === 1 && revealStep < 3) return <div key={pos.place} className="w-24 sm:w-36 flex flex-col items-center justify-end h-full" />

            return (
              <div key={pos.place} className="flex flex-col items-center justify-end h-full animate-podium-rise" style={{ animationDelay: pos.delay }}>
                {p && (
                  <>
                    {/* Name Badge */}
                    <div className="bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/5 font-extrabold text-sm text-white mb-2 shadow-lg select-none truncate max-w-[100px] sm:max-w-[140px]">
                      {p.name}
                    </div>

                    {/* Overlapping Avatar */}
                    <div className={`w-20 h-20 rounded-full flex items-center justify-center bg-white/10 border ${pos.border} shadow-2xl relative z-10 translate-y-7`}>
                      <AvatarImage avatar={p.avatar} className="w-17 h-17" />
                      <span className="absolute -top-3 right-0 text-xl leading-none">{pos.icon}</span>
                    </div>
                  </>
                )}

                {/* Column block */}
                <div
                  className={`w-24 sm:w-36 rounded-t-2xl border ${pos.border} ${pos.bg} ${pos.shadow} ${pos.height} flex flex-col items-center justify-center pt-8 pb-4`}
                >
                  {p ? (
                    <>
                      <span className={`text-5xl sm:text-6xl font-black ${pos.text} opacity-80 leading-none mb-2 select-none`}>
                        {pos.place}
                      </span>
                      <span className="text-xs sm:text-sm font-extrabold text-white/90 tracking-wide select-none">
                        {p.total_score.toLocaleString()} pts
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Leaderboard or Runner-ups List */}
      {(!isFinal || revealStep >= 4) && (
        <div className="animate-fade-in">
          {isFinal && runnerUpPlayers.length > 0 && (
            <h3 className="text-lg font-bold text-gray-400 mb-3 select-none">Runner-ups</h3>
          )}

          <div className="space-y-3 mb-8">
            {runnerUpPlayers.map((p, i) => {
              const actualIndex = isFinal ? i + 3 : i
              return (
                <div
                  key={p.name}
                  className={`glass-card px-5 py-4 flex items-center gap-4 animate-slide-up ${actualIndex < 3 ? 'ring-1 ring-yellow-500/20' : ''}`}
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div className="text-2xl w-8 text-center">
                    {actualIndex < 3 ? RANK_STYLES[actualIndex] : <span className="text-gray-500 text-lg font-bold">#{actualIndex + 1}</span>}
                  </div>
                  <AvatarImage avatar={p.avatar} className="w-10 h-10" />
                  <div className="flex-1 font-semibold">{p.name}</div>
                  <div className="font-black text-xl text-brand-300">{p.total_score.toLocaleString()}</div>
                </div>
              )
            })}
            {players.length === 0 && (
              <p className="text-gray-500 text-center py-8">No scores yet</p>
            )}
          </div>
        </div>
      )}

      {!isFinal && (
        <button
          onClick={onNext}
          disabled={loading}
          className="btn-primary w-full text-lg py-4"
          id="host-continue-btn"
        >
          {loading ? 'Loading…' : nextLabel}
        </button>
      )}

      {isFinal && revealStep >= 4 && (
        <div className="text-center animate-fade-in">
          <p className="text-gray-400 mb-4">Game over! Thanks for playing.</p>
          <a href="/host/dashboard" className="btn-primary inline-block">
            Back to Dashboard
          </a>
        </div>
      )}
    </div>
  )
}
