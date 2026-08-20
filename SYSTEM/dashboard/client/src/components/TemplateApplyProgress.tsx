import React, { useEffect, useState } from 'react'
import { advanceTemplateApplyProgress, getTemplateApplyStagePercent } from '../lib/templateApplyProgress'

export default function TemplateApplyProgress({ active, label }: { active: boolean; label: string }) {
  const stagePercent = getTemplateApplyStagePercent(label)
  const [progress, setProgress] = useState(stagePercent)

  useEffect(() => {
    if (!active) {
      setProgress(8)
      return
    }
    setProgress((current) => Math.max(current, stagePercent))
    if (stagePercent >= 100) return
    const timer = window.setInterval(() => {
      setProgress((current) => advanceTemplateApplyProgress(current, stagePercent))
    }, 1200)
    return () => window.clearInterval(timer)
  }, [active, stagePercent])

  if (!active) return null

  return (
    <div className="w-full rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-left dark:border-emerald-800 dark:bg-emerald-950/40" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-3 text-xs font-medium text-emerald-900 dark:text-emerald-100">
        <span className="min-w-0 truncate">{label}</span>
        <span className="shrink-0">{progress}%</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-950">
        <div
          className="h-full rounded-full bg-emerald-600 transition-[width] duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}
