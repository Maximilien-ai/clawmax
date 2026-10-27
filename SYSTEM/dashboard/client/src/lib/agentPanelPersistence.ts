import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'

export const AGENT_PANEL_KEEP_OPEN_KEY = 'clawmax-agent-panels-keep-open'
const CHANGE_EVENT = 'clawmax-agent-panel-preference'

export function readAgentPanelKeepOpen(): boolean {
  try { return window.localStorage.getItem(AGENT_PANEL_KEEP_OPEN_KEY) === 'true' } catch { return false }
}

/** One browser preference for agent details, configuration and both chat layouts. */
export function useAgentPanelPersistence(onClose: () => void, canDismiss = true) {
  const [keepOpen, setKeepOpen] = useState(readAgentPanelKeepOpen)
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!panelRef.current?.contains(document.activeElement)) panelRef.current?.focus()
    return () => { if (previous?.isConnected) previous.focus() }
  }, [])
  useEffect(() => {
    const changed = (event: Event) => {
      if (event instanceof CustomEvent) setKeepOpen(event.detail === true)
      else if ((event as StorageEvent).key === AGENT_PANEL_KEEP_OPEN_KEY || (event as StorageEvent).key === null) setKeepOpen(readAgentPanelKeepOpen())
    }
    window.addEventListener(CHANGE_EVENT, changed)
    window.addEventListener('storage', changed)
    return () => {
      window.removeEventListener(CHANGE_EVENT, changed)
      window.removeEventListener('storage', changed)
    }
  }, [])

  function toggleKeepOpen() {
    const next = !keepOpen
    setKeepOpen(next)
    try { window.localStorage.setItem(AGENT_PANEL_KEEP_OPEN_KEY, String(next)) } catch { /* Still works for this open panel. */ }
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }))
  }

  return {
    panelRef,
    keepOpen,
    toggleKeepOpen,
    onBackdropClick(event: MouseEvent<HTMLElement>) {
      if (event.target === event.currentTarget && !keepOpen && canDismiss) onClose()
    },
    onEscape(event: KeyboardEvent<HTMLElement>) {
      if (event.key !== 'Escape' || event.defaultPrevented || !canDismiss) return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    },
  }
}
