import type { ReactNode } from 'react'

export function SelectionActionBar({
  summary,
  children,
}: {
  summary: ReactNode
  children: ReactNode
}) {
  return (
    <div className="fixed inset-x-0 bottom-4 z-40 px-4">
      <div className="mx-auto max-w-5xl rounded-2xl border border-purple-200 bg-white/95 px-4 py-3 shadow-xl backdrop-blur dark:border-purple-800 dark:bg-gray-900/95">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {summary}
          </div>
          <div className="flex flex-wrap gap-2">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
