import { useEffect, useState } from 'react'

interface GroupEntry {
  name: string
  description: string | null
}

interface LiveEntry {
  name: string
  key: string
  description: string | null
}

type DiffKind = 'both' | 'local_only'

interface DiffEntry {
  name: string
  kind: DiffKind
  description: string | null
  selected: boolean
}

interface Props {
  agentId: string
  agentName: string
  localGroups: GroupEntry[]
  localCommunities: GroupEntry[]
  onClose: () => void
  onSynced: () => void
}

function buildDiff(live: LiveEntry[], local: GroupEntry[]): DiffEntry[] {
  const liveNames = new Set(live.map(g => g.name.toLowerCase()))
  const entries: DiffEntry[] = []

  // Items found in WA sessions
  for (const l of live) {
    const lk = l.name.toLowerCase()
    const localMatch = local.find(g => g.name.toLowerCase() === lk)
    // Prefer local description, fallback to WA description
    const description = localMatch?.description ?? l.description ?? null
    entries.push({ name: l.name, kind: 'both', description, selected: true })
  }

  // Items in local config but not in WA (orphaned)
  for (const loc of local) {
    if (!liveNames.has(loc.name.toLowerCase())) {
      entries.push({ name: loc.name, kind: 'local_only', description: loc.description, selected: false })
    }
  }

  return entries
}

function DiffSection({
  title,
  color,
  diff,
  onToggle,
}: {
  title: string
  color: 'purple' | 'indigo'
  diff: DiffEntry[]
  onToggle: (name: string) => void
}) {
  if (diff.length === 0) return null

  const accent = color === 'purple'
    ? { border: 'border-purple-200', bg: 'bg-purple-50', text: 'text-purple-700', badge: 'bg-purple-100 text-purple-700' }
    : { border: 'border-indigo-200', bg: 'bg-indigo-50', text: 'text-indigo-700', badge: 'bg-indigo-100 text-indigo-700' }

  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{title}</p>
      <div className="space-y-1.5">
        {diff.map(entry => (
          <label
            key={entry.name}
            className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
              entry.selected
                ? entry.kind === 'local_only'
                  ? 'border-amber-200 bg-amber-50'
                  : `${accent.border} ${accent.bg}`
                : 'border-gray-100 bg-gray-50 opacity-60'
            }`}
          >
            <input
              type="checkbox"
              checked={entry.selected}
              onChange={() => onToggle(entry.name)}
              className="mt-0.5 accent-emerald-600"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-800 truncate dark:text-gray-200">{entry.name}</span>
                {entry.kind === 'both' && (
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${accent.badge}`}>in WA</span>
                )}
                {entry.kind === 'local_only' && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium shrink-0">orphaned</span>
                )}
              </div>
              {entry.description && (
                <p className="text-xs text-gray-400 mt-0.5 truncate">{entry.description}</p>
              )}
            </div>
          </label>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-1">
        {diff.filter(e => e.selected).length} of {diff.length} kept
      </p>
    </div>
  )
}

export default function SyncGroupsPanel({ agentId, agentName, localGroups, localCommunities, onClose, onSynced }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [groupDiff, setGroupDiff] = useState<DiffEntry[]>([])
  const [commDiff, setCommDiff] = useState<DiffEntry[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/agents/${agentId}/wa-groups`)
      .then(r => r.json())
      .then((data: { groups?: LiveEntry[]; communities?: LiveEntry[]; error?: string }) => {
        if (data.error) { setError(data.error); setLoading(false); return }
        setGroupDiff(buildDiff(data.groups ?? [], localGroups))
        setCommDiff(buildDiff(data.communities ?? [], localCommunities))
        setLoading(false)
      })
      .catch(e => { setError(String(e)); setLoading(false) })
  }, [agentId, localGroups, localCommunities])

  function toggleGroup(name: string) {
    setGroupDiff(prev => prev.map(e => e.name === name ? { ...e, selected: !e.selected } : e))
  }

  function toggleComm(name: string) {
    setCommDiff(prev => prev.map(e => e.name === name ? { ...e, selected: !e.selected } : e))
  }

  async function applySync() {
    setSaving(true)
    // Deduplicate by name (case-insensitive)
    const dedupeByName = (arr: { name: string; description: string | null }[]) => {
      const seen = new Map<string, { name: string; description: string | null }>()
      for (const item of arr) {
        const key = item.name.toLowerCase()
        if (!seen.has(key)) seen.set(key, item)
      }
      return Array.from(seen.values())
    }
    const groups = dedupeByName(groupDiff.filter(e => e.selected).map(e => ({ name: e.name, description: e.description })))
    const communities = dedupeByName(commDiff.filter(e => e.selected).map(e => ({ name: e.name, description: e.description })))
    try {
      const r = await fetch(`/api/agents/${agentId}/groups/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communities, groups }),
      })
      const data = await r.json()
      if (data.ok) { onSynced(); onClose() }
      else setError(data.error ?? 'Sync failed')
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const totalItems = groupDiff.length + commDiff.length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-[560px] max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">Sync Groups &amp; Communities from WhatsApp</h2>
            <p className="text-xs text-gray-400 mt-0.5">Agent: <span className="font-mono">{agentName}</span></p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <span className="animate-spin">↻</span> Fetching live sessions from gateway…
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error.includes('timeout') || error.includes('connection failed')
                ? 'Could not reach the agent gateway — is the agent running?'
                : error}
            </div>
          )}

          {!loading && !error && totalItems === 0 && (
            <p className="text-sm text-gray-400">No WhatsApp groups or communities found in the agent's session history.</p>
          )}

          {!loading && !error && totalItems > 0 && (
            <>
              <p className="text-xs text-gray-500">
                Review WA sessions found in this agent's session history. Items marked <span className="text-amber-600 font-medium">orphaned</span> are in your config but have no WA session — they may have been removed or renamed.
              </p>

              <DiffSection title="Communities" color="purple" diff={commDiff} onToggle={toggleComm} />
              <DiffSection title="Groups" color="indigo" diff={groupDiff} onToggle={toggleGroup} />
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            disabled={saving}
            className="text-sm px-4 py-1.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 transition-colors dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={applySync}
            disabled={loading || saving || !!error || totalItems === 0}
            className={`text-sm px-4 py-1.5 rounded font-medium transition-colors ${
              loading || saving || !!error || totalItems === 0
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-sky-600 text-white hover:bg-sky-700'
            }`}
          >
            {saving ? 'Saving…' : 'Apply to GROUPS.md'}
          </button>
        </div>
      </div>
    </div>
  )
}
