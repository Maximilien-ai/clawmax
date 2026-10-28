import React, { forwardRef, useEffect, useRef, useState } from 'react'

/** Search and selection share one dropdown; typing never changes the saved selection. */
export const SearchableModelSelect = forwardRef<HTMLButtonElement, React.SelectHTMLAttributes<HTMLSelectElement> & { searchLabel?: string }>(function SearchableModelSelect({ children, searchLabel = 'Search models', ...props }, ref) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [above, setAbove] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const needle = query.trim().toLowerCase()
  let selectedLabel = ''
  function filter(nodes: React.ReactNode, group = ''): React.ReactNode[] {
    return React.Children.toArray(nodes).flatMap(child => {
      if (!React.isValidElement<any>(child)) return []
      if (child.type === 'option') {
        const value = String(child.props.value ?? '')
        const text = React.Children.toArray(child.props.children).join(' ')
        if (value === String(props.value ?? '')) selectedLabel = text
        return !needle || `${group} ${text} ${value}`.toLowerCase().includes(needle) ? [child] : []
      }
      const nested = filter(child.props.children, child.type === 'optgroup' ? String(child.props.label) : group)
      return nested.length ? [React.cloneElement(child, {}, nested)] : []
    })
  }
  const options = filter(children)
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', outside, true)
    return () => document.removeEventListener('pointerdown', outside, true)
  }, [open])
  const close = () => { setOpen(false); trigger.current?.focus() }
  return <div ref={root} className="relative min-w-0" onKeyDownCapture={event => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close() }
  }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false) }}>
    <button type="button" data-model-value={String(props.value ?? '')} id={props.id} ref={node => { trigger.current = node; if (typeof ref === 'function') ref(node); else if (ref) ref.current = node }} disabled={props.disabled} aria-label={props['aria-label'] || (props.id ? undefined : searchLabel.replace(/^Search /, ''))} aria-haspopup="listbox" aria-expanded={open} className={`${props.className || ''} flex items-center justify-between gap-2 text-left`} onClick={() => { const rect = trigger.current?.getBoundingClientRect(); setAbove(!!rect && rect.bottom > window.innerHeight - 320 && rect.top > 320); setQuery(''); setOpen(!open) }}>
      <span className="truncate">{selectedLabel || String(props.value || 'Select a model')}</span><span aria-hidden="true">⌄</span>
    </button>
    {open && <div className={`absolute inset-x-0 ${above ? 'bottom-full mb-1' : 'top-full mt-1'} z-50 rounded-lg border border-gray-300 bg-white p-2 shadow-xl dark:border-gray-600 dark:bg-gray-900`}>
      <input autoFocus type="search" aria-label={searchLabel} placeholder="Search models or providers…" value={query} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); root.current?.querySelector('select')?.focus() } if (event.key === 'Enter') event.preventDefault() }} onChange={event => setQuery(event.target.value)} className="mb-2 w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
      {options.length ? <select aria-label="Matching models" size={8} value={props.value} onChange={event => { props.onChange?.(event); close() }} className="w-full max-h-48 overflow-auto rounded border-0 bg-white text-sm dark:bg-gray-900 dark:text-gray-100">{options}</select> : <p role="status" className="p-2 text-sm text-gray-500">No matching models</p>}
    </div>}
  </div>
})
