import React, { useState } from 'react'
import { byokForRequest } from '../lib/byok'

export type ChannelDraft = { name: string; description: string; members: string[]; community?: string }
export function ChannelAiDraftEditor({ kind, disabled, onBusyChange, onDraft }: {
  kind: 'group' | 'community'; disabled: boolean; onBusyChange: (busy: boolean) => void; onDraft: (draft: ChannelDraft) => void
}) {
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const generate = async () => {
    setBusy(true); onBusyChange(true); setError('')
    try {
      const response = await fetch('/api/channel-draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, description: prompt, byokKeys: byokForRequest() }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not generate a draft')
      onDraft(result.draft)
    } catch (reason: any) { setError(reason.message || 'Could not generate a draft. Try again.') }
    finally { setBusy(false); onBusyChange(false) }
  }
  return <div className="space-y-2">
    <label className="block text-sm font-medium" htmlFor="channel-ai-prompt">Create with AI</label>
    <textarea id="channel-ai-prompt" value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="Describe the purpose and which agents should participate…" rows={3} className="w-full rounded border p-2 bg-white dark:bg-gray-800" disabled={busy || disabled} />
    <button type="button" onClick={generate} disabled={!prompt.trim() || busy || disabled} className="px-3 py-2 rounded border disabled:opacity-50">{busy ? 'Generating…' : 'Generate draft'}</button>
    <p className="text-xs text-gray-500">Review the draft below. Nothing is saved until you click Create.</p>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </div>
}
export function ChannelMemberPicker({ agents, members, onChange }: {
  agents: Array<{ id: string; archived?: boolean }>; members: string[]; onChange: (members: string[]) => void
}) {
  const active = agents.filter(agent => !agent.archived)
  return <fieldset className="space-y-2">
    <legend className="text-sm font-medium">Agent members</legend>
    <div className="max-h-40 overflow-y-auto space-y-1">
      {active.map(agent => <label key={agent.id} className="flex items-center gap-2 break-all text-sm"><input type="checkbox" checked={members.includes(agent.id)} onChange={event => onChange(event.target.checked ? [...members, agent.id] : members.filter(id => id !== agent.id))} />{agent.id}</label>)}
      {!active.length && <p className="text-sm text-gray-500">No agents yet. You can add members later.</p>}
    </div>
  </fieldset>
}
