import type { ReactNode } from 'react'

export function SelectionActionBar({
  summary,
  children,
}: {
  summary: ReactNode
  children: ReactNode
}) {
  return (
    <div className="fixed bottom-6 left-1/2 z-40 max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-x-auto rounded-lg bg-blue-600 px-6 py-3 text-white shadow-2xl">
      <div className="flex items-center gap-3">
        <span className="whitespace-nowrap font-medium">
          {summary}
        </span>
        {children}
      </div>
    </div>
  )
}
