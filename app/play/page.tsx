import JoinForm from '@/components/player/JoinForm'

export const metadata = {
  title: 'Join a Quiz — VibeQuiz',
  description: 'Enter a room code to join a live quiz game.',
}

export default function PlayPage() {
  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-purple-600/15 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black mb-1">
            <span className="text-white">Vibe</span>
            <span className="bg-gradient-to-r from-brand-400 to-purple-400 bg-clip-text text-transparent">Quiz</span>
          </h1>
          <p className="text-gray-400">Enter a code to join</p>
        </div>

        <div className="glass-card p-8">
          <JoinForm />
        </div>
      </div>
    </main>
  )
}
