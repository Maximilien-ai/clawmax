import { useEffect, useRef, useState } from 'react'
import { channelLabel } from '../lib/channelLabel'
import { availableAgentGroups, changeAgentGroupMembership, loadAgentGroupOptions, type AgentGroup } from '../lib/agentGroupMemberships'

export default function AgentGroupMemberships({ agentId, agentName, groups, onNavigateToGroup }: {
  agentId: string
  agentName: string
  groups: AgentGroup[]
  onNavigateToGroup?: (name: string) => void
}) {
  const [memberships, setMemberships] = useState(groups)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<AgentGroup[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const adding = useRef(false)
  const addButton = useRef<HTMLButtonElement>(null)
  const loadSequence = useRef(0)
  const signature = JSON.stringify(groups)
  useEffect(() => { setMemberships(JSON.parse(signature)) }, [agentId, signature])
  useEffect(() => () => { loadSequence.current++ }, [])

  async function loadOptions() {
    const sequence = ++loadSequence.current
    setLoading(true)
    setError(null)
    try {
      const next = await loadAgentGroupOptions()
      if (sequence === loadSequence.current) setOptions(next)
    } catch (err) {
      if (sequence === loadSequence.current) { setOptions(null); setError(err instanceof Error ? err.message : 'Could not load groups') }
    } finally { if (sequence === loadSequence.current) setLoading(false) }
  }

  async function change(group: AgentGroup, member: boolean) {
    if (adding.current) return
    adding.current = true
    setBusy(group.name)
    setError(null)
    setNotice('')
    try {
      const saved = await changeAgentGroupMembership(agentId, group.name, member)
      setMemberships(saved)
      setNotice(`${member ? 'Added to' : 'Removed from'} ${channelLabel(group)}`)
      setQuery('')
      window.dispatchEvent(new Event('agents-updated'))
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not update groups') }
    finally { adding.current = false; setBusy(null) }
  }

  const available = availableAgentGroups(options || [], memberships, query)
  return (
    <div className="min-w-0 w-full space-y-2" role="group" aria-label={`Groups for ${agentName}`} onClick={event => event.stopPropagation()}>
      <div className="flex flex-wrap items-center gap-1.5">
        {memberships.map(group => (
          <span key={group.name} className="inline-flex max-w-full items-center rounded-md bg-indigo-50 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
            {onNavigateToGroup ? (
              <button type="button" onClick={() => onNavigateToGroup(group.name)} title={group.description || channelLabel(group)} className="min-w-0 break-words px-2 py-1 text-left hover:underline">{channelLabel(group)}</button>
            ) : <span className="min-w-0 break-words px-2 py-1">{channelLabel(group)}</span>}
            <button type="button" disabled={busy !== null} onClick={() => void change(group, false)} aria-label={`Remove ${agentName} from ${channelLabel(group)}`} title={`Remove from ${channelLabel(group)}`} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-r-md hover:bg-indigo-100 focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-50 dark:hover:bg-indigo-900/60">{busy === group.name ? '…' : '×'}</button>
          </span>
        ))}
        <button ref={addButton} type="button" aria-expanded={open} onClick={() => { setOpen(!open); if (!open) { setQuery(''); void loadOptions() } }} className="rounded-md border border-dashed border-gray-300 px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50 focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-gray-600 dark:text-sky-300 dark:hover:bg-gray-700">+ Add to group</button>
      </div>
      {open && (
        <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-900" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); addButton.current?.focus() } }}>
          <input autoFocus value={query} onChange={event => setQuery(event.target.value)} aria-label={`Search groups for ${agentName}`} placeholder="Search groups..." className="w-full min-w-0 rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-sky-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
          {loading ? <p role="status" className="text-xs text-gray-500">Loading groups...</p> : options && (
            <div className="max-h-48 space-y-1 overflow-y-auto overscroll-contain">
              {available.length === 0 && <p className="text-xs text-gray-500">{query.trim() ? 'No matching groups.' : options.length === 0 ? 'No groups exist yet. Create one in Communications.' : 'This agent belongs to every available group.'}</p>}
              {available.map(group => <button key={group.name} type="button" disabled={busy !== null} onClick={() => void change(group, true)} aria-label={`Add ${agentName} to ${channelLabel(group)}`} className="flex w-full min-w-0 items-start justify-between gap-2 rounded px-2 py-1.5 text-left text-sm text-gray-800 hover:bg-sky-50 focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-50 dark:text-gray-200 dark:hover:bg-gray-800"><span className="min-w-0 break-words">{channelLabel(group)}{group.description && <span className="block text-xs text-gray-500">{group.description}</span>}</span><span className="shrink-0 text-sky-600">{busy === group.name ? 'Adding…' : '+ Add'}</span></button>)}
            </div>
          )}
          {!loading && !options && error && <button type="button" onClick={() => void loadOptions()} className="text-xs text-sky-600 underline">Retry loading groups</button>}
        </div>
      )}
      {busy && <p role="status" className="text-xs text-gray-500">Saving group membership...</p>}
      {error && <p role="alert" className="break-words text-xs text-red-600 dark:text-red-400">{error}</p>}
      <p role="status" aria-live="polite" className={notice ? 'text-xs text-gray-500' : 'sr-only'}>{notice}</p>
    </div>
  )
}
