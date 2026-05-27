'use client'

import { useState } from 'react'

export default function StatusButton() {
  const [checking, setChecking] = useState(false)

  const handleRefresh = () => {
    setChecking(true)
    // Add a tiny, highly premium 600ms visual delay so the user feels like the check is actually running
    setTimeout(() => {
      window.location.href = '/'
    }, 600)
  }

  return (
    <div className="mt-8 flex justify-center">
      <button
        onClick={handleRefresh}
        disabled={checking}
        className="relative group px-8 py-4 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold rounded-2xl transition-all duration-200 active:scale-98 disabled:opacity-80 disabled:scale-100 cursor-pointer shadow-lg shadow-violet-500/20 hover:shadow-violet-500/35 overflow-hidden"
      >
        {/* Glowing border outline */}
        <div className="absolute inset-0 border border-white/20 rounded-2xl group-hover:border-white/40 transition-colors" />

        {/* Shimmer reflection highlight */}
        <div className="absolute top-0 -left-[100%] w-1/2 h-full bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-12 group-hover:animate-shimmer" />

        <span className="flex items-center gap-3">
          {checking ? (
            <>
              {/* Spinner icon */}
              <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Checking system status...
            </>
          ) : (
            <>
              {/* Check status icon */}
              <svg className="h-5 w-5 text-violet-200 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.2" />
              </svg>
              Check Status
            </>
          )}
        </span>
      </button>
    </div>
  )
}
