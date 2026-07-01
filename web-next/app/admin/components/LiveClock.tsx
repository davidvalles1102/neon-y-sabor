'use client'

import { useEffect, useState } from 'react'

export default function LiveClock({ className = 'live-clock' }: { className?: string }) {
  const [time, setTime] = useState('')

  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return <div className={className}>{time}</div>
}
