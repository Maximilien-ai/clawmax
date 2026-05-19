import React from 'react'

export interface HostAgentStatusBannerConfig {
  state: 'unauthorized' | 'unreachable' | 'warning'
  title: string
  detail: string
  hint: string
}

export function HostAgentStatusBanner({
  status,
}: {
  status: HostAgentStatusBannerConfig
}) {
  const tone = status.state === 'unauthorized'
    ? {
        wrap: 'border-red-300 bg-red-100 text-red-950 shadow-sm dark:border-red-900/70 dark:bg-red-950/70 dark:text-red-50',
        chip: 'bg-red-700 text-white dark:bg-red-500 dark:text-red-950',
      }
    : {
        wrap: 'border-amber-300 bg-amber-100 text-amber-950 shadow-sm dark:border-amber-900/70 dark:bg-amber-950/70 dark:text-amber-50',
        chip: 'bg-amber-600 text-white dark:bg-amber-400 dark:text-amber-950',
      }

  return (
    <div className={`border-y px-4 py-3 text-sm ${tone.wrap}`}>
      <div className="mx-auto flex max-w-6xl items-start gap-3">
        <span className={`mt-0.5 rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone.chip}`}>
          {status.state}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{status.title}</div>
          <div className="mt-1 whitespace-pre-wrap font-medium">{status.detail}</div>
          <div className="mt-1 text-xs opacity-90">{status.hint}</div>
        </div>
      </div>
    </div>
  )
}
