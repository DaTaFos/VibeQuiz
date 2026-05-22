'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type AuthMode = 'signin' | 'signup'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<AuthMode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    const supabase = createClient()

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        setError(error.message)
        setLoading(false)
      } else {
        router.push('/host/dashboard')
        router.refresh()
      }
    } else {
      // Sign Up
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      })

      if (error) {
        setError(error.message)
        setLoading(false)
      } else {
        // If "Confirm Email" is disabled in Supabase, the user is signed in immediately
        if (data.session) {
          router.push('/host/dashboard')
          router.refresh()
        } else {
          setMessage('Account created! Please check your email to verify your account (if email confirmation is active).')
          setLoading(false)
        }
      }
    }
  }

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      {/* Visual background glowing orb */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-brand-600/15 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-md animate-fade-in">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-black mb-2">
            <span className="text-white">Vibe</span>
            <span className="bg-gradient-to-r from-brand-400 to-purple-400 bg-clip-text text-transparent">Quiz</span>
          </h1>
          <p className="text-gray-400">Host Dashboard</p>
        </div>

        <div className="glass-card p-8">
          {/* Mode Switcher Tabs */}
          <div className="flex bg-white/5 p-1 rounded-xl mb-6">
            <button
              onClick={() => { setMode('signin'); setError(null); setMessage(null); }}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                mode === 'signin'
                  ? 'bg-brand-500 text-white shadow-lg'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setMode('signup'); setError(null); setMessage(null); }}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                mode === 'signup'
                  ? 'bg-brand-500 text-white shadow-lg'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="input-field"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input-field"
              />
            </div>

            {error && (
              <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 animate-fade-in">
                {error}
              </p>
            )}

            {message && (
              <p className="text-green-400 text-sm bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-3 animate-fade-in">
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
              id="login-submit"
            >
              {loading
                ? (mode === 'signin' ? 'Signing In…' : 'Registering…')
                : (mode === 'signin' ? '🔑 Sign In' : '✨ Create Account')
              }
            </button>
          </form>
        </div>

        <p className="text-center text-gray-600 text-xs mt-6 px-4 leading-relaxed">
          {mode === 'signin'
            ? 'Sign in to access your saved quizzes and host live lobbies.'
            : 'Turn off "Confirm email" in Supabase Authentication Settings to enable instant, rate-limit-free registrations!'
          }
        </p>
      </div>
    </main>
  )
}
