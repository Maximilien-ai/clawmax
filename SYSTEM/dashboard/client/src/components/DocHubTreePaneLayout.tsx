import type { ReactNode } from 'react'

export function DocHubTreePaneLayout({
  toolbar,
  children,
}: {
  toolbar: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div data-testid="dochub-tree-toolbar" className="shrink-0">
        {toolbar}
      </div>
      <div data-testid="dochub-tree-scroll-region" className="min-h-0 flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}
