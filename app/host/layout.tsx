import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default function HostLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950">
      <HostNav />
      {children}
    </div>
  )
}

async function HostNav() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <nav className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
      <Link href="/host/dashboard" className="text-xl font-black">
        <span className="text-white">Vibe</span>
        <span className="bg-gradient-to-r from-brand-400 to-purple-400 bg-clip-text text-transparent">Quiz</span>
      </Link>

      <div className="flex items-center gap-4">
        <span className="text-gray-400 text-sm hidden sm:block">{user.email}</span>
        <form action="/auth/signout" method="post">
          <button
            formAction={async () => {
              'use server'
              const supabase = await createClient()
              await supabase.auth.signOut()
              redirect('/login')
            }}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Sign out
          </button>
        </form>
      </div>
    </nav>
  )
}
