import { createClient } from '@/lib/supabase/server'
import Countdown from '@/components/maintenance/Countdown'
import StatusButton from '@/components/maintenance/StatusButton'

export const dynamic = 'force-dynamic'

export default async function MaintenancePage() {
  const supabase = await createClient()

  // Fetch the latest maintenance mode status
  const { data: settings } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'maintenance_mode')
    .single()

  const value = settings?.value || {
    active: false,
    message: 'VibeQuiz is currently undergoing scheduled database maintenance. We will be back shortly!',
    estimated_end: null,
  }

  return (
    <main className="relative min-h-screen w-full bg-gray-950 flex flex-col items-center justify-center p-4 overflow-hidden">
      {/* Premium glowing background mesh */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-violet-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[400px] bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Decorative floating grids */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

      <div className="w-full max-w-xl text-center relative z-10 animate-slide-up">
        {/* Animated Double-Gear construct visual */}
        <div className="relative h-32 flex items-center justify-center mb-8">
          {/* Main Large Gear (Slow spin) */}
          <div 
            className="absolute text-violet-500/20"
            style={{ animation: 'spin 18s linear infinite' }}
          >
            <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l-.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/>
            </svg>
          </div>

          {/* Small Interlocking Gear (Faster reverse spin) */}
          <div 
            className="absolute text-fuchsia-500/25 -translate-x-12 -translate-y-8"
            style={{ animation: 'spin 10s linear infinite reverse' }}
          >
            <svg className="w-14 h-14" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l-.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/>
            </svg>
          </div>
        </div>

        {/* System Status Banner Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-semibold tracking-wider uppercase mb-6 shadow-inner shadow-violet-500/5">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-ping" />
          System Maintenance
        </div>

        {/* Glass Card Wrapper */}
        <div className="glass-card p-8 md:p-10 shadow-2xl relative overflow-hidden">
          {/* Subtle upper glass sheen border */}
          <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />

          <h1 className="text-3xl md:text-4xl font-black bg-gradient-to-b from-white to-gray-300 bg-clip-text text-transparent mb-4 tracking-tight">
            VibeQuiz is upgrading!
          </h1>

          <p className="text-gray-400 leading-relaxed text-sm md:text-base mb-6 font-medium">
            {value.message}
          </p>

          {/* Dynamic Countdown Component */}
          <Countdown estimatedEnd={value.estimated_end} />

          {/* Premium Check Status / Refresh Button */}
          <StatusButton />
        </div>

        {/* Footer */}
        <p className="mt-8 text-xs text-gray-600 font-medium">
          Thank you for your patience! We'll be back online in a vibe.
        </p>
      </div>
    </main>
  )
}
