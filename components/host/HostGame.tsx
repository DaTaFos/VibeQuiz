'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePresence } from '@/hooks/usePresence'
import { useHostChannel } from '@/hooks/useHostChannel'
import type { Question, LeaderboardEntry, Room } from '@/lib/types'

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
  const [timerActive, setTimerActive] = useState(false)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [questionResults, setQuestionResults] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const { players } = usePresence(room.room_code)
  const { broadcastNextQuestion, broadcastLeaderboard, broadcastGameEnded } =
    useHostChannel(room.room_code)

  // Countdown timer
  useEffect(() => {
    if (!timerActive || timeLeft <= 0) return
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { setTimerActive(false); return 0 }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [timerActive, timeLeft])

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

    const startedAt = Date.now()
    setCurrentQ(idx)
    setPhase('question')
    setTimeLeft(q.time_limit)
    setTimerActive(true)
    setQuestionResults(null)

    await broadcastNextQuestion({
      questionIndex: idx + 1,
      questionId: q.id,
      text: q.text,
      options: { A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d },
      timeLimitSeconds: q.time_limit,
      startedAt,
    })
  }

  async function handleNext() {
    setLoading(true)
    setTimerActive(false)

    const q = questions[currentQ]
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

    const { data } = await supabase.rpc('advance_question', { p_room_code: room.room_code })
    if (data?.success) await sendQuestion(nextIdx)
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
      onNext={() => {}}
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
  return (
    <div className="max-w-2xl mx-auto px-4 py-10 text-center animate-fade-in">
      <p className="text-gray-400 text-sm mb-2">Room Code</p>
      <div className="text-7xl font-black tracking-[0.15em] mb-2 bg-gradient-to-r from-brand-400 to-purple-400 bg-clip-text text-transparent animate-pulse-glow">
        {room.room_code}
      </div>
      <p className="text-gray-400 mb-8">Share this code with your players</p>

      <div className="glass-card p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">Players Joined</h2>
          <span className="text-2xl font-bold text-brand-400">{players.length}</span>
        </div>
        <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
          {players.map((p) => (
            <div key={p.playerId} className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1 text-sm animate-bounce-in">
              {p.avatar && <span>{p.avatar}</span>}
              <span>{p.name}</span>
            </div>
          ))}
          {players.length === 0 && (
            <p className="text-gray-500 text-sm">Waiting for players to join…</p>
          )}
        </div>
      </div>

      <p className="text-gray-400 text-sm mb-6">{questionCount} questions ready</p>

      <button
        onClick={onStart}
        disabled={loading || players.length === 0}
        className="btn-primary text-lg px-10 py-4 w-full"
        id="start-game-btn"
      >
        {loading ? 'Starting…' : '🚀 Start Game'}
      </button>
      {players.length === 0 && (
        <p className="text-gray-500 text-xs mt-2">At least 1 player must join to start</p>
      )}
    </div>
  )
}

function QuestionView({
  question, questionNumber, total, timeLeft, onNext, loading,
}: {
  question: Question
  questionNumber: number
  total: number
  timeLeft: number
  onNext: () => void
  loading: boolean
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

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 animate-fade-in">
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

      {/* Top players */}
      <div className="space-y-3 mb-8">
        {players.slice(0, 10).map((p, i) => (
          <div
            key={p.name}
            className={`glass-card px-5 py-4 flex items-center gap-4 animate-slide-up ${i < 3 ? 'ring-1 ring-yellow-500/20' : ''}`}
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="text-2xl w-8 text-center">
              {i < 3 ? RANK_STYLES[i] : <span className="text-gray-500 text-lg font-bold">#{i + 1}</span>}
            </div>
            <div className="text-xl">{p.avatar ?? '😶'}</div>
            <div className="flex-1 font-semibold">{p.name}</div>
            <div className="font-black text-xl text-brand-300">{p.total_score.toLocaleString()}</div>
          </div>
        ))}
        {players.length === 0 && (
          <p className="text-gray-500 text-center py-8">No scores yet</p>
        )}
      </div>

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

      {isFinal && (
        <div className="text-center">
          <p className="text-gray-400 mb-4">Game over! Thanks for playing.</p>
          <a href="/host/dashboard" className="btn-primary inline-block">
            Back to Dashboard
          </a>
        </div>
      )}
    </div>
  )
}
