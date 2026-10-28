import React, { forwardRef, useState } from 'react'

/** Native keyboard selection with a visible filter; preserve the selected value while searching. */
export const SearchableModelSelect = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { searchLabel?: string }>(function SearchableModelSelect({ children, searchLabel = 'Search models', ...props }, ref) {
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  function filter(nodes: React.ReactNode, group = ''): React.ReactNode[] {
    return React.Children.toArray(nodes).flatMap(child => {
      if (!React.isValidElement<any>(child)) return []
      if (child.type === 'option') {
        const value = String(child.props.value ?? '')
        const text = React.Children.toArray(child.props.children).join(' ')
        return !needle || !value || value === String(props.value ?? '') || `${group} ${text} ${value}`.toLowerCase().includes(needle) ? [child] : []
      }
      const nested = filter(child.props.children, child.type === 'optgroup' ? String(child.props.label) : group)
      return nested.length ? [React.cloneElement(child, {}, nested)] : []
    })
  }
  return <div className="min-w-0 space-y-1">
    <input type="search" aria-label={searchLabel} placeholder="Search models or providers…" value={query} disabled={props.disabled} onChange={event => setQuery(event.target.value)} className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100" />
    <select {...props} aria-label={props['aria-label'] || (props.id ? undefined : searchLabel.replace(/^Search /, ''))} ref={ref}>{filter(children)}</select>
    {needle && <p className="text-xs text-gray-500" role="status">Filtered models; your current selection stays visible. Clear search to see all.</p>}
  </div>
})
