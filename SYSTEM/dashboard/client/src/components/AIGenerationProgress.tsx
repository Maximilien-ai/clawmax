import React, { useEffect, useState } from 'react'

export default function AIGenerationProgress({ active, label = 'Generating with AI…' }: { active: boolean; label?: string }) {
  const [progress, setProgress] = useState(8)

  useEffect(() => {
    if (!active) {
      setProgress(8)
      return
    }
    const timer = window.setInterval(() => setProgress((value) => Math.min(92, value + (value < 55 ? 5 : 2))), 1200)
    return () => window.clearInterval(timer)
  }, [active])

  if (!active) return null
  return (
    <div className="mt-3 rounded-md border border-purple-200 bg-purple-50 px-3 py-2 dark:border-purple-800 dark:bg-purple-950/40" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-purple-900 dark:text-purple-100">
        <span>{label}</span><span>{progress}%</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-purple-100 dark:bg-purple-950">
        <div className="h-full rounded-full bg-purple-600 transition-[width] duration-500" style={{ width: `${progress}%` }} />
      </div>
    </div>
  )
}
