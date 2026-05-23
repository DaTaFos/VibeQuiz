'use client'

import { useRef, useCallback } from 'react'

/**
 * Tracks the offset between the client clock and the server clock.
 * Call calibrate(serverTimeMs) once per broadcast to keep the offset fresh.
 * Call correctedNow() anywhere to get a server-corrected timestamp in ms.
 */
export function useServerClock() {
  const offsetRef = useRef(0) // serverTime - clientTime

  const calibrate = useCallback((serverTimeMs: number) => {
    const clientReceiveTime = Date.now()
    offsetRef.current = serverTimeMs - clientReceiveTime
  }, [])

  const correctedNow = useCallback(() => {
    return Date.now() + offsetRef.current
  }, [])

  return { calibrate, correctedNow }
}
