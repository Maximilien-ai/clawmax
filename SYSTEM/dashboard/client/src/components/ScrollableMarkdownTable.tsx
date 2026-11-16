import React from 'react'

/** Keep wide Markdown tables inside their message, with keyboard-accessible scrolling. */
export function ScrollableMarkdownTable({ children }: { children?: React.ReactNode }) {
  return <div role="region" aria-label="Scrollable table" tabIndex={0} className="max-w-full overflow-x-auto focus:outline-sky-500"><table>{children}</table></div>
}
