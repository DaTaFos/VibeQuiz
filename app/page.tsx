import Link from 'next/link'

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-gray-950 flex flex-col">
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-20 text-center">
        {/* Glowing background orb */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-brand-600/20 rounded-full blur-[120px]" />
        </div>

        <div className="relative z-10 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500/20 border border-brand-400/30 rounded-full text-brand-300 text-sm font-medium mb-8">
            ⚡ Real-time · Up to 300 players · Zero lag
          </div>

          <h1 className="text-6xl md:text-8xl font-black tracking-tight mb-6">
            <span className="text-white">Vibe</span>
            <span className="bg-gradient-to-r from-brand-400 to-purple-400 bg-clip-text text-transparent">
              Quiz
            </span>
          </h1>

          <p className="text-xl text-gray-400 max-w-2xl mb-12 leading-relaxed">
            Host live, multiplayer quiz battles. Share a 6-digit code,
            watch players join in real time, and crown a champion.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 justify-center">
            <Link
              href="/host/dashboard"
              className="btn-primary text-lg px-8 py-4"
            >
              🎮 Host a Quiz
            </Link>
            <Link
              href="/play"
              className="btn-secondary text-lg px-8 py-4"
            >
              Join a Game
            </Link>
          </div>
        </div>

        {/* Feature grid */}
        <div className="relative z-10 mt-24 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl w-full animate-slide-up">
          {[
            {
              icon: '🚀',
              title: '< 100ms Latency',
              desc: 'Supabase Realtime Broadcast delivers questions instantly to all players.',
            },
            {
              icon: '🔒',
              title: 'Anti-Cheat Built In',
              desc: 'Answer keys never leave the server. All scoring is done server-side.',
            },
            {
              icon: '🏆',
              title: 'Time-Decayed Scoring',
              desc: 'Faster correct answers earn more points. Speed matters.',
            },
          ].map((f) => (
            <div key={f.title} className="glass-card p-6 text-left">
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="font-bold text-white mb-2">{f.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <footer className="text-center py-6 text-gray-600 text-sm">
        Built with Next.js + Supabase
      </footer>
    </main>
  )
}
