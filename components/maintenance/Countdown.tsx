'use client'

import { useEffect, useState } from 'react'

interface CountdownProps {
  estimatedEnd: string | null
}

interface TimeRemaining {
  days: number
  hours: number
  minutes: number
  seconds: number
  isExpired: boolean
}

export default function Countdown({ estimatedEnd }: CountdownProps) {
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining | null>(null)

  useEffect(() => {
    if (!estimatedEnd) return

    const targetDate = new Date(estimatedEnd)

    function calculateTime(): TimeRemaining {
      const difference = targetDate.getTime() - Date.now()
      
      if (difference <= 0) {
        return { days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true }
      }

      return {
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((difference / 1000 / 60) % 60),
        seconds: Math.floor((difference / 1000) % 60),
        isExpired: false,
      }
    }

    // Set initial time
    setTimeRemaining(calculateTime())

    // Update timer every second
    const interval = setInterval(() => {
      setTimeRemaining(calculateTime())
    }, 1000)

    return () => clearInterval(interval)
  }, [estimatedEnd])

  if (!estimatedEnd || !timeRemaining) return null

  if (timeRemaining.isExpired) {
    return (
      <div className="mt-8 px-6 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-center font-medium animate-pulse">
        ✨ Scheduled maintenance window has concluded! Click "Check Status" to enter the app.
      </div>
    )
  }

  const timeBlocks = [
    { label: 'Days', value: timeRemaining.days },
    { label: 'Hours', value: timeRemaining.hours },
    { label: 'Minutes', value: timeRemaining.minutes },
    { label: 'Seconds', value: timeRemaining.seconds },
  ]

  return (
    <div className="mt-10 w-full animate-fade-in">
      <div className="text-center text-xs font-semibold uppercase tracking-widest text-violet-400/80 mb-4">
        Estimated Time Remaining
      </div>
      
      <div className="grid grid-cols-4 gap-3 md:gap-4 max-w-md mx-auto">
        {timeBlocks.map((block) => (
          <div 
            key={block.label} 
            className="flex flex-col items-center justify-center p-3 md:p-4 rounded-2xl bg-white/[0.03] border border-white/10 shadow-lg relative overflow-hidden group"
          >
            {/* Top delicate purple highlight */}
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-violet-500 to-fuchsia-500 opacity-80" />
            
            {/* Soft glowing ambient circle behind the text */}
            <div className="absolute -bottom-10 -right-10 w-20 h-20 bg-violet-600/10 rounded-full blur-xl group-hover:scale-150 transition-transform duration-500" />

            <span className="text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-b from-white to-gray-300 bg-clip-text text-transparent">
              {String(block.value).padStart(2, '0')}
            </span>
            
            <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-gray-500 mt-1">
              {block.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
