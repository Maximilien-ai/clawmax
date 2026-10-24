import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AGENT_PANEL_KEEP_OPEN_KEY, readAgentPanelKeepOpen, useAgentPanelPersistence } from '../lib/agentPanelPersistence'
import { KeepAgentPanelOpenButton } from './KeepAgentPanelOpenButton'

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
const stored = new Map<string, string>()
let writesFail = false
let readsFail = false
const events: Event[] = []
Object.defineProperty(globalThis, 'window', { configurable: true, value: {
  localStorage: {
    getItem(key: string) { if (readsFail) throw new Error('Storage blocked'); return stored.get(key) ?? null },
    setItem(key: string, value: string) { if (writesFail) throw new Error('Storage full'); stored.set(key, value) },
  },
  dispatchEvent(event: Event) { events.push(event); return true },
} })

try {
  let closes = 0
  let captured: ReturnType<typeof useAgentPanelPersistence>
  function Probe({ canDismiss = true }: { canDismiss?: boolean }) {
    captured = useAgentPanelPersistence(() => { closes++ }, canDismiss)
    return null
  }
  const render = (canDismiss = true) => { renderToStaticMarkup(createElement(Probe, { canDismiss })); return captured }
  const backdrop = {} as HTMLElement
  const child = {} as HTMLElement
  const click = (target = backdrop) => ({ target, currentTarget: backdrop }) as unknown as Parameters<typeof captured.onBackdropClick>[0]
  const escape = (defaultPrevented = false) => ({
    key: 'Escape', defaultPrevented, stopped: false,
    preventDefault() { this.defaultPrevented = true },
    stopPropagation() { this.stopped = true },
  })

  assert.equal(readAgentPanelKeepOpen(), false, 'New browsers dismiss on outside click')
  render().onBackdropClick(click())
  assert.equal(closes, 1)
  render().onBackdropClick(click(child))
  assert.equal(closes, 1, 'An inside click never dismisses')
  render().toggleKeepOpen()
  assert.equal(stored.get(AGENT_PANEL_KEEP_OPEN_KEY), 'true')
  assert.equal(events.length, 1, 'Other mounted agent surfaces are notified')
  const pinned = render()
  assert.equal(pinned.keepOpen, true, 'Reopened panels restore the preference')
  pinned.onBackdropClick(click())
  assert.equal(closes, 1, 'Pinned panels ignore outside clicks')
  const key = escape()
  pinned.onEscape(key as unknown as Parameters<typeof pinned.onEscape>[0])
  assert.equal(closes, 2, 'Escape still closes a pinned panel')
  assert(key.defaultPrevented && key.stopped, 'Escape cannot also dismiss an underlying panel')
  pinned.onEscape(escape(true) as unknown as Parameters<typeof pinned.onEscape>[0])
  assert.equal(closes, 2, 'A nested menu can consume Escape')
  pinned.toggleKeepOpen()
  assert.equal(render().keepOpen, false, 'Turning off persistence restores default dismissal')
  render(false).onBackdropClick(click())
  render(false).onEscape(escape() as unknown as Parameters<typeof pinned.onEscape>[0])
  assert.equal(closes, 2, 'Saving configuration prevents incidental dismissal')
  readsFail = true
  assert.equal(readAgentPanelKeepOpen(), false, 'Blocked storage does not break the panel')
  readsFail = false
  writesFail = true
  assert.doesNotThrow(() => render().toggleKeepOpen(), 'A full store does not crash a preference change')
  const off = renderToStaticMarkup(createElement(KeepAgentPanelOpenButton, { keepOpen: false, onToggle() {} }))
  const on = renderToStaticMarkup(createElement(KeepAgentPanelOpenButton, { keepOpen: true, onToggle() {} }))
  assert(off.includes('aria-label="Keep open"') && off.includes('aria-pressed="false"'))
  assert(on.includes('aria-pressed="true"') && on.includes('close with Escape or X'))
  assert(on.includes('h-9 w-9'), 'The control remains compact at mobile widths')
  console.log('AgentPanelPersistence.test.tsx: passed')
} finally {
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
  else Reflect.deleteProperty(globalThis, 'window')
}
