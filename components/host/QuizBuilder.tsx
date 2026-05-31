'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Question } from '@/lib/types'

interface QuizBuilderProps {
  quizId?: string
  initialTitle?: string
  initialDescription?: string
  initialQuestions?: Partial<Question>[]
  mode: 'create' | 'edit'
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const
const OPTION_COLORS: Record<string, string> = {
  A: 'text-red-400 border-red-500/30 bg-red-500/10',
  B: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  C: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10',
  D: 'text-green-400 border-green-500/30 bg-green-500/10',
}

type DraftQuestion = {
  id?: string
  text: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_option: 'A' | 'B' | 'C' | 'D'
  time_limit: number
  max_points: number
  image_url: string | null
}

function emptyQuestion(): DraftQuestion {
  return {
    text: '',
    option_a: '',
    option_b: '',
    option_c: '',
    option_d: '',
    correct_option: 'A',
    time_limit: 30,
    max_points: 1000,
    image_url: null,
  }
}

export default function QuizBuilder({
  quizId,
  initialTitle = '',
  initialDescription = '',
  initialQuestions = [],
  mode,
}: QuizBuilderProps) {
  const router = useRouter()
  const supabase = createClient()

  const [title, setTitle] = useState(initialTitle)
  const [description, setDescription] = useState(initialDescription)
  const [questions, setQuestions] = useState<DraftQuestion[]>(
    initialQuestions.length > 0
      ? (initialQuestions as DraftQuestion[])
      : [emptyQuestion()]
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedIdx, setExpandedIdx] = useState(0)

  function updateQuestion(idx: number, patch: Partial<DraftQuestion>) {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)))
  }

  function addQuestion() {
    setQuestions((prev) => [...prev, emptyQuestion()])
    setExpandedIdx(questions.length)
  }

  function removeQuestion(idx: number) {
    if (questions.length === 1) return
    setQuestions((prev) => prev.filter((_, i) => i !== idx))
    setExpandedIdx(Math.max(0, idx - 1))
  }

  function moveQuestion(idx: number, dir: -1 | 1) {
    const next = idx + dir
    if (next < 0 || next >= questions.length) return
    setQuestions((prev) => {
      const arr = [...prev]
      ;[arr[idx], arr[next]] = [arr[next], arr[idx]]
      return arr
    })
    setExpandedIdx(next)
  }

  async function handleSave() {
    setError(null)
    if (!title.trim()) { setError('Quiz title is required.'); return }
    if (questions.some((q) => !q.text.trim() || !q.option_a || !q.option_b || !q.option_c || !q.option_d)) {
      setError('All questions must have text and four options filled in.')
      return
    }

    setSaving(true)
    try {
      let resolvedQuizId = quizId

      if (mode === 'create') {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('You must be logged in to create a quiz.')

        const { data, error: qErr } = await supabase
          .from('quizzes')
          .insert({
            title: title.trim(),
            description: description.trim() || null,
            host_id: user.id,
          })
          .select('id')
          .single()
        if (qErr) throw qErr
        resolvedQuizId = data.id
      } else {
        const { error: uErr } = await supabase
          .from('quizzes')
          .update({ title: title.trim(), description: description.trim() || null })
          .eq('id', resolvedQuizId!)
        if (uErr) throw uErr

        // Delete existing questions and re-insert (simplest for reordering)
        await supabase.from('questions').delete().eq('quiz_id', resolvedQuizId!)
      }

      const rows = questions.map((q, i) => ({
        quiz_id: resolvedQuizId!,
        position: i + 1,
        text: q.text.trim(),
        option_a: q.option_a.trim(),
        option_b: q.option_b.trim(),
        option_c: q.option_c.trim(),
        option_d: q.option_d.trim(),
        correct_option: q.correct_option,
        time_limit: q.time_limit,
        max_points: q.max_points,
        image_url: q.image_url,
      }))

      const { error: qInsertErr } = await supabase.from('questions').insert(rows)
      if (qInsertErr) throw qInsertErr

      router.push('/host/dashboard')
      router.refresh()
    } catch (err: any) {
      setError(err.message ?? 'Failed to save quiz.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold mb-8">
        {mode === 'create' ? '✨ New Quiz' : '✏️ Edit Quiz'}
      </h1>

      {/* Quiz meta */}
      <div className="glass-card p-6 mb-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Quiz Title *</label>
          <input
            id="quiz-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. World Geography Trivia"
            className="input-field"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Description (optional)</label>
          <textarea
            id="quiz-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A short description of this quiz"
            className="input-field resize-none"
            rows={2}
          />
        </div>
      </div>

      {/* Questions */}
      <div className="space-y-4 mb-6">
        {questions.map((q, idx) => (
          <QuestionCard
            key={idx}
            q={q}
            idx={idx}
            total={questions.length}
            expanded={expandedIdx === idx}
            onToggle={() => setExpandedIdx(expandedIdx === idx ? -1 : idx)}
            onChange={(patch) => updateQuestion(idx, patch)}
            onRemove={() => removeQuestion(idx)}
            onMove={(dir) => moveQuestion(idx, dir)}
          />
        ))}
      </div>

      <button onClick={addQuestion} className="btn-secondary w-full mb-8" id="add-question-btn">
        + Add Question
      </button>

      {error && (
        <p className="text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 mb-4 text-sm">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button onClick={() => router.back()} className="btn-secondary flex-1">
          Cancel
        </button>
        <button onClick={handleSave} disabled={saving} className="btn-primary flex-1" id="save-quiz-btn">
          {saving ? 'Saving…' : '💾 Save Quiz'}
        </button>
      </div>
    </div>
  )
}

function QuestionCard({
  q, idx, total, expanded, onToggle, onChange, onRemove, onMove,
}: {
  q: DraftQuestion
  idx: number
  total: number
  expanded: boolean
  onToggle: () => void
  onChange: (p: Partial<DraftQuestion>) => void
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
}) {
  const optionKeys = ['option_a', 'option_b', 'option_c', 'option_d'] as const

  return (
    <div className={`glass-card overflow-hidden transition-all ${expanded ? 'ring-1 ring-brand-400/50' : ''}`}>
      {/* Header */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-white/5 transition-colors"
        onClick={onToggle}
        id={`question-card-${idx}`}
      >
        <div className="w-8 h-8 rounded-lg bg-brand-500/20 text-brand-300 flex items-center justify-center text-sm font-bold shrink-0">
          {idx + 1}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{q.text || <span className="text-gray-500">Untitled question</span>}</p>
          <p className="text-xs text-gray-500 mt-0.5">{q.time_limit}s · {q.max_points} pts · Answer: {q.correct_option}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onMove(-1) }}
            disabled={idx === 0}
            className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30 transition-colors"
            title="Move up"
          >↑</button>
          <button
            onClick={(e) => { e.stopPropagation(); onMove(1) }}
            disabled={idx === total - 1}
            className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30 transition-colors"
            title="Move down"
          >↓</button>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove() }}
            disabled={total === 1}
            className="p-1.5 rounded hover:bg-red-500/20 text-red-400 disabled:opacity-30 transition-colors"
            title="Delete"
          >✕</button>
          <span className="text-gray-500 text-sm ml-1">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div className="px-4 pb-6 space-y-4 border-t border-white/10 pt-4 animate-fade-in">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Question Text *</label>
            <textarea
              value={q.text}
              onChange={(e) => onChange({ text: e.target.value })}
              placeholder="What is the capital of France?"
              className="input-field resize-none"
              rows={2}
              id={`q-text-${idx}`}
            />
          </div>

          <QuestionImageInput
            imageUrl={q.image_url}
            onChange={(url) => onChange({ image_url: url })}
            idx={idx}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {OPTION_LETTERS.map((letter, li) => {
              const key = optionKeys[li]
              return (
                <div key={letter}>
                  <label className={`block text-sm font-medium mb-1.5 ${OPTION_COLORS[letter].split(' ')[0]}`}>
                    Option {letter}
                  </label>
                  <input
                    value={(q as any)[key]}
                    onChange={(e) => onChange({ [key]: e.target.value })}
                    placeholder={`Option ${letter}`}
                    className={`w-full px-3 py-2 rounded-lg border text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-brand-400 ${OPTION_COLORS[letter]} bg-opacity-10`}
                    id={`q-${idx}-${letter.toLowerCase()}`}
                  />
                </div>
              )
            })}
          </div>

          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Correct Answer</label>
              <div className="flex gap-2">
                {OPTION_LETTERS.map((letter) => (
                  <button
                    key={letter}
                    onClick={() => onChange({ correct_option: letter })}
                    className={`w-10 h-10 rounded-lg font-bold text-sm transition-all ${
                      q.correct_option === letter
                        ? 'bg-green-500 text-white ring-2 ring-green-400 scale-110'
                        : 'bg-white/10 text-gray-300 hover:bg-white/20'
                    }`}
                    id={`q-${idx}-correct-${letter}`}
                  >
                    {letter}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Time Limit</label>
              <select
                value={q.time_limit}
                onChange={(e) => onChange({ time_limit: Number(e.target.value) })}
                className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                id={`q-${idx}-time`}
              >
                {[5, 10, 15, 20, 30, 45, 60, 90, 120].map((t) => (
                  <option key={t} value={t} className="bg-gray-900">{t}s</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Max Points</label>
              <select
                value={q.max_points}
                onChange={(e) => onChange({ max_points: Number(e.target.value) })}
                className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                id={`q-${idx}-points`}
              >
                {[500, 1000, 2000].map((p) => (
                  <option key={p} value={p} className="bg-gray-900">{p} pts</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function QuestionImageInput({
  imageUrl,
  onChange,
  idx,
}: {
  imageUrl: string | null
  onChange: (url: string | null) => void
  idx: number
}) {
  const supabase = createClient()
  const [activeTab, setActiveTab] = useState<'upload' | 'url'>(imageUrl?.startsWith('http') ? 'url' : 'upload')
  const [uploading, setUploading] = useState(false)
  const [inputUrl, setInputUrl] = useState(imageUrl ?? '')

  useEffect(() => {
    setInputUrl(imageUrl ?? '')
  }, [imageUrl])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Limit to 5MB
    if (file.size > 5 * 1024 * 1024) {
      alert('File is too large. Max limit is 5MB.')
      return
    }

    setUploading(true)
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`
      const filePath = `question-images/${fileName}`

      const { data, error } = await supabase.storage
        .from('question-images')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        })

      if (error) throw error

      const { data: { publicUrl } } = supabase.storage
        .from('question-images')
        .getPublicUrl(filePath)

      onChange(publicUrl)
    } catch (err: any) {
      alert(err.message || 'Error uploading file')
    } finally {
      setUploading(false)
    }
  }

  const handleUrlSubmit = () => {
    if (inputUrl.trim()) {
      onChange(inputUrl.trim())
    } else {
      onChange(null)
    }
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-300">Question Image (Optional)</label>
      
      {imageUrl ? (
        <div className="relative inline-block group">
          <div className="relative rounded-xl overflow-hidden border border-white/10 glass-card p-1.5 shadow-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="Question preview" className="max-h-48 rounded-lg object-contain" />
            <button
              onClick={() => {
                onChange(null)
                setInputUrl('')
              }}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-red-600/90 text-white flex items-center justify-center font-bold hover:bg-red-700 hover:scale-105 active:scale-95 transition-all shadow-lg focus:outline-none"
              title="Remove image"
            >
              ✕
            </button>
          </div>
        </div>
      ) : (
        <div className="border border-white/10 rounded-xl bg-white/[0.02] p-4">
          <div className="flex gap-2 mb-4 border-b border-white/10 pb-2">
            <button
              type="button"
              onClick={() => setActiveTab('upload')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                activeTab === 'upload'
                  ? 'bg-brand-500/20 text-brand-300 border border-brand-400/30'
                  : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              📁 Upload File
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('url')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                activeTab === 'url'
                  ? 'bg-brand-500/20 text-brand-300 border border-brand-400/30'
                  : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              🔗 Image URL
            </button>
          </div>

          {activeTab === 'upload' ? (
            <div className="flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-lg p-6 hover:border-brand-500/50 hover:bg-white/[0.01] transition-all cursor-pointer relative">
              <input
                key="file-upload-input"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                disabled={uploading}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                id={`q-image-upload-${idx}`}
              />
              <div className="text-center space-y-1">
                <span className="text-2xl">{uploading ? '⏳' : '🖼️'}</span>
                <p className="text-sm font-medium text-white/80">
                  {uploading ? 'Uploading image...' : 'Click or drag image file here'}
                </p>
                <p className="text-xs text-gray-500">PNG, JPG, WEBP or GIF (Max 5MB)</p>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                key="url-text-input"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="Paste image URL here... (e.g. https://example.com/photo.jpg)"
                className="input-field flex-1"
                id={`q-image-url-input-${idx}`}
              />
              <button
                type="button"
                onClick={handleUrlSubmit}
                className="btn-primary py-2 px-4 shrink-0 text-sm"
              >
                Apply
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
