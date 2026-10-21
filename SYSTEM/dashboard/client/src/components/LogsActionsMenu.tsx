import React, { useEffect, useRef, useState } from 'react'
import { headerSecondaryButtonClass, headerSecondaryButtonIdleClass } from '../lib/headerControls'
import { ProductIconCell } from '../lib/productIcons'
import { getViewportSafeDropdownStyle } from '../lib/dropdownPosition'

export default function LogsActionsMenu({ paused, autoScroll, empty, onPauseResume, onAutoScroll, onRefresh, onDownload, onClear }: {
  paused: boolean; autoScroll: boolean; empty: boolean
  onPauseResume: () => void; onAutoScroll: () => void; onRefresh: () => void
  onDownload: () => void; onClear: () => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  const run = (action: () => void) => { action(); setOpen(false); trigger.current?.focus() }
  const item = 'w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-40'
  const icon = 'border-transparent bg-transparent text-current'
  return <div ref={root} className="relative" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false) }}>
    <button ref={trigger} type="button" aria-expanded={open} aria-controls="log-actions" onClick={() => setOpen(value => !value)}
      title="Actions" aria-label="Log actions" className={`${headerSecondaryButtonClass} ${headerSecondaryButtonIdleClass}`}>
      <ProductIconCell iconName="ai" label="Actions" size="sm" className={icon} /> Actions <span className="text-xs">▾</span></button>
    {open && <div id="log-actions" aria-label="Log actions" className="z-30 max-h-[70dvh] overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1"
      style={trigger.current ? getViewportSafeDropdownStyle(trigger.current.getBoundingClientRect(), 288) : undefined}>
      <section aria-label="Live view">
        <h2 className="px-3 py-1 text-xs font-semibold uppercase text-gray-500">Live view</h2>
        <button type="button" className={item} onClick={() => run(onPauseResume)}><ProductIconCell iconName={paused ? 'play' : 'pause'} size="sm" className={icon} />{paused ? 'Resume live logs' : 'Pause live logs'}</button>
        <button type="button" className={item} aria-pressed={autoScroll} onClick={() => run(onAutoScroll)}><ProductIconCell iconName="list" size="sm" className={icon} />{autoScroll ? '✓ ' : ''}Auto-scroll</button>
      </section>
      <section aria-label="Log data" className="my-1 border-y border-gray-200 py-1 dark:border-gray-700">
        <h2 className="px-3 py-1 text-xs font-semibold uppercase text-gray-500">Log data</h2>
        <button type="button" className={item} onClick={() => run(onRefresh)}><ProductIconCell iconName="refresh" size="sm" className={icon} />Refresh logs</button>
        <button type="button" className={item} disabled={empty} onClick={() => run(onDownload)}><ProductIconCell iconName="download" size="sm" className={icon} />Download filtered logs</button>
      </section>
      <section aria-label="Display">
        <h2 className="px-3 py-1 text-xs font-semibold uppercase text-gray-500">Display</h2>
        <button type="button" className={item} onClick={() => run(onClear)}><ProductIconCell iconName="delete" size="sm" className={icon} />Clear visible logs</button>
        <p className="px-3 pb-2 text-xs text-gray-500">Clears this view and paused buffer only. Server log files are not deleted.</p>
      </section>
    </div>}
  </div>
}
