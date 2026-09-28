import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { buildNavigationDestinations, searchNavigationDestinations, type SearchDestination } from '../lib/navigationSearch'
import type { DashboardPage } from '../lib/navigation'

type Props = {
  pages: Array<{ page: DashboardPage; title: string; terms?: string }>
  onNavigate: (destination: SearchDestination) => void
}

async function readList(url: string, key: string, signal: AbortSignal): Promise<Record<string, unknown>[]> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`${key}: HTTP ${response.status}`)
  const data = await response.json()
  return Array.isArray(data?.[key]) ? data[key] : []
}

export function NavigationSearch({ pages, onNavigate }: Props) {
  const { activeWorkspace } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [items, setItems] = useState<{ agents: Record<string, unknown>[]; workflows: Record<string, unknown>[]; templates: Record<string, unknown>[]; skills: Record<string, unknown>[] }>({ agents: [], workflows: [], templates: [], skills: [] })
  const inputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const workspaceKey = activeWorkspace?.id || activeWorkspace?.path || ''

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return
      if (event.target instanceof HTMLElement && event.target.closest('input,textarea,select,[contenteditable="true"]')) return
      event.preventDefault()
      setOpen((current) => !current)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!open) { setQuery(''); setSelected(0); triggerRef.current?.focus(); return }
    inputRef.current?.focus()
    const controller = new AbortController()
    setLoading(true)
    setError(false)
    setItems({ agents: [], workflows: [], templates: [], skills: [] })
    const load = async () => {
      const responses = await Promise.allSettled([
        readList('/api/agents', 'agents', controller.signal),
        readList('/api/workflows', 'workflows', controller.signal),
        fetch('/api/templates', { signal: controller.signal }).then(async (response) => {
          if (!response.ok) throw new Error(`templates: HTTP ${response.status}`)
          const data = await response.json()
          return [...(Array.isArray(data.agents) ? data.agents : []), ...(Array.isArray(data.organizations) ? data.organizations : []), ...(Array.isArray(data.workflows) ? data.workflows : [])]
        }),
        readList('/api/skills', 'skills', controller.signal),
      ])
      if (controller.signal.aborted) return
      setItems({
        agents: responses[0].status === 'fulfilled' ? responses[0].value : [],
        workflows: responses[1].status === 'fulfilled' ? responses[1].value : [],
        templates: responses[2].status === 'fulfilled' ? responses[2].value : [],
        skills: responses[3].status === 'fulfilled' ? responses[3].value : [],
      })
      setError(responses.some((response) => response.status === 'rejected'))
      setLoading(false)
    }
    void load()
    return () => controller.abort()
  }, [open, workspaceKey])

  const entries = useMemo(() => buildNavigationDestinations({ pages, ...items }), [pages, items])
  const results = useMemo(() => searchNavigationDestinations(entries, query), [entries, query])
  const choose = (destination: SearchDestination) => { setOpen(false); onNavigate(destination) }

  return <>
    <button ref={triggerRef} type="button" onClick={() => setOpen(true)} aria-label="Search ClawMax" title="Search ClawMax (⌘/Ctrl+K)" className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700">
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg>
      <span className="hidden lg:inline">Search</span><kbd className="hidden xl:inline text-xs text-gray-400">⌘/Ctrl K</kbd>
    </button>
    {open && createPortal(<div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 px-3 pt-[8vh] sm:pt-[12vh]" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>
      <div role="dialog" aria-modal="true" aria-label="Search ClawMax" onKeyDown={(event) => {
        if (event.key === 'Escape') { event.preventDefault(); setOpen(false) }
        if (event.key !== 'Tab') return
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('input,button'))
        const first = buttons[0]
        const last = buttons[buttons.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }} className="flex max-h-[82dvh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center gap-2 border-b border-gray-200 p-3 dark:border-gray-700">
          <input ref={inputRef} value={query} onChange={(event) => { setQuery(event.target.value); setSelected(0) }} onKeyDown={(event) => {
            if (event.key === 'Escape') { event.preventDefault(); setOpen(false) }
            if (event.key === 'ArrowDown') { event.preventDefault(); setSelected((current) => Math.min(current + 1, results.length - 1)) }
            if (event.key === 'ArrowUp') { event.preventDefault(); setSelected((current) => Math.max(0, current - 1)) }
            if (event.key === 'Enter' && results[selected]) { event.preventDefault(); choose(results[selected]) }
          }} aria-label="Search pages, agents, workflows, templates, and skills" aria-controls="clawmax-navigation-results" aria-activedescendant={results[selected] ? `clawmax-search-${selected}` : undefined} role="combobox" aria-expanded="true" autoComplete="off" placeholder="Search pages, agents, workflows, templates, skills…" className="min-w-0 flex-1 bg-transparent px-1 py-1 text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100" />
          <button type="button" onClick={() => setOpen(false)} aria-label="Close search" className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">Esc</button>
        </div>
        <div id="clawmax-navigation-results" role="listbox" className="min-h-0 overflow-y-auto overscroll-contain p-2">
          {loading && <p className="px-3 py-2 text-sm text-gray-500">Loading workspace items…</p>}
          {error && <p role="status" className="px-3 py-2 text-sm text-amber-700 dark:text-amber-300">Some workspace items could not load. Page results remain available.</p>}
          {results.length === 0 && !loading && <p className="px-3 py-4 text-sm text-gray-500">No results in this workspace.</p>}
          {results.map((entry, index) => <button id={`clawmax-search-${index}`} role="option" aria-selected={selected === index} key={entry.key} type="button" onMouseEnter={() => setSelected(index)} onClick={() => choose(entry)} className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm ${selected === index ? 'bg-sky-50 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100' : 'text-gray-800 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700'}`}>
            <span className="min-w-0 truncate">{entry.title}</span><span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{entry.subtitle}</span>
          </button>)}
        </div>
        <div className="border-t border-gray-200 px-3 py-2 text-xs text-gray-500 dark:border-gray-700">↑↓ Select · Enter Open · Esc Close</div>
      </div>
    </div>, document.body)}
  </>
}
