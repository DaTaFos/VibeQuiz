'use client'

import { useState, useEffect, useRef } from 'react'

interface AccountDropdownProps {
  email: string
  signOutAction: () => Promise<void>
}

export default function AccountDropdown({ email, signOutAction }: AccountDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Initial for avatar letter
  const initial = email ? email.charAt(0).toUpperCase() : 'U'

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Avatar Icon Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 hover:border-white/20 transition-all duration-200 active:scale-95 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 focus:ring-offset-gray-950"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <span className="text-sm font-bold text-white select-none">{initial}</span>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2.5 w-60 rounded-2xl bg-gray-900/90 backdrop-blur-md border border-white/10 shadow-2xl p-2 animate-bounce-in z-50 origin-top-right">
          {/* User Info Header */}
          <div className="px-4 py-3 select-none">
            <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider mb-0.5">Signed in as</p>
            <p className="text-sm font-semibold text-white truncate" title={email}>
              {email}
            </p>
          </div>

          <div className="h-px bg-white/10 my-1.5" />

          {/* Action List */}
          <form action={signOutAction} className="w-full">
            <button
              type="submit"
              className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 active:scale-[0.98] transition-all duration-200 text-left focus:outline-none"
            >
              <span className="text-base">🚪</span>
              <span>Sign out</span>
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
