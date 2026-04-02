import React, { useState } from 'react'
import { fetchModelsWithByok } from '../lib/byok'

interface Agent {
  id: string
  name: string
  archived?: boolean
  paused?: boolean
}

interface BulkOperationsPanelProps {
  selectedAgents: Agent[]
  allCommunities: Array<{ name: string; description: string | null }>
  allGroups: Array<{ name: string; description: string | null }>
  onClose: () => void
  onAddToCommunities: (agentIds: string[], communities: string[]) => Promise<void>
  onAddToGroups: (agentIds: string[], groups: string[]) => Promise<void>
  onArchive: (agentIds: string[]) => Promise<void>
  onUnarchive: (agentIds: string[]) => Promise<void>
  onPause?: (agentIds: string[]) => Promise<void>
  onResume?: (agentIds: string[]) => Promise<void>
  onDelete?: (agents: Array<{ id: string; archived?: boolean }>) => Promise<void>
  onChat?: (agentIds: string[]) => void
  onChangeModel?: (agentIds: string[], model: string) => Promise<void>
  onBulkSkills?: (agentIds: string[], addSkills: string[], removeSkills: string[]) => Promise<void>
}

export default function BulkOperationsPanel({
  selectedAgents,
  allCommunities,
  allGroups,
  onClose,
  onAddToCommunities,
  onAddToGroups,
  onArchive,
  onUnarchive,
  onPause,
  onResume,
  onDelete,
  onChat,
  onChangeModel,
  onBulkSkills,
}: BulkOperationsPanelProps) {
  const [operation, setOperation] = useState<'communities' | 'groups' | 'archive' | 'unarchive' | 'pause' | 'resume' | 'delete' | 'model' | 'skills' | 'doctor' | 'workflow' | null>(null)
  const [availableWorkflows, setAvailableWorkflows] = useState<Array<{ id: string; name: string }>>([])
  const [selectedWorkflow, setSelectedWorkflow] = useState('')
  const [doctorResults, setDoctorResults] = useState<any>(null)
  const [selectedCommunities, setSelectedCommunities] = useState<Set<string>>(new Set())
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set())
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [modelSearch, setModelSearch] = useState('')
  const [availableSkills, setAvailableSkills] = useState<Array<{ id: string; name: string; emoji?: string }>>([])
  const [selectedSkillsToAdd, setSelectedSkillsToAdd] = useState<Set<string>>(new Set())
  const [skillSearch, setSkillSearch] = useState('')
  const [processing, setProcessing] = useState(false)
  const [processingLabel, setProcessingLabel] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [deleteImpact, setDeleteImpact] = useState<any>(null)
  const [showSecondConfirm, setShowSecondConfirm] = useState(false)

  const archivedCount = selectedAgents.filter(a => a.archived).length
  const activeCount = selectedAgents.length - archivedCount

  async function handleFirstConfirm() {
    // For delete, fetch impact and show second confirmation
    if (operation === 'delete' && onDelete) {
      setProcessing(true)
      try {
        const agents = selectedAgents.map(a => ({ id: a.id, archived: a.archived }))
        const resp = await fetch('/api/agents/bulk-impact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agents })
        })
        const data = await resp.json()
        setDeleteImpact(data.summary)
        setShowConfirm(true)
        setShowSecondConfirm(true)
      } catch (err) {
        console.error('Failed to fetch impact:', err)
      } finally {
        setProcessing(false)
      }
    } else {
      // For other operations, just set showConfirm
      setShowConfirm(true)
    }
  }

  const OPERATION_LABELS: Record<string, string> = {
    communities: 'Adding to communities',
    groups: 'Adding to groups',
    archive: 'Archiving agents',
    unarchive: 'Unarchiving agents',
    pause: 'Pausing agents',
    resume: 'Resuming agents',
    delete: 'Deleting agents',
    model: 'Changing model',
    skills: 'Assigning skills',
    doctor: 'Running doctor',
    workflow: 'Adding to workflow',
  }

  async function handleExecute() {
    setProcessing(true)
    setProcessingLabel(OPERATION_LABELS[operation || ''] || 'Processing')
    try {
      const agentIds = selectedAgents.map(a => a.id)

      if (operation === 'communities' && selectedCommunities.size > 0) {
        await onAddToCommunities(agentIds, Array.from(selectedCommunities))
      } else if (operation === 'groups' && selectedGroups.size > 0) {
        await onAddToGroups(agentIds, Array.from(selectedGroups))
      } else if (operation === 'archive') {
        await onArchive(agentIds)
      } else if (operation === 'unarchive') {
        await onUnarchive(agentIds)
      } else if (operation === 'pause' && onPause) {
        await onPause(agentIds)
      } else if (operation === 'resume' && onResume) {
        await onResume(agentIds)
      } else if (operation === 'model' && onChangeModel && selectedModel) {
        await onChangeModel(agentIds, selectedModel)
      } else if (operation === 'skills' && onBulkSkills && selectedSkillsToAdd.size > 0) {
        await onBulkSkills(agentIds, Array.from(selectedSkillsToAdd), [])
      } else if (operation === 'doctor') {
        const resp = await fetch('/api/agents/doctor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fix: true }) })
        const data = await resp.json()
        setDoctorResults(data)
        // Restart all selected agents after doctor
        for (const a of selectedAgents) {
          try { await fetch(`/api/agents/${a.id}/restart`, { method: 'POST' }) } catch {}
        }
        setProcessing(false)
        return // Don't close — show results
      } else if (operation === 'workflow' && selectedWorkflow) {
        // Add selected agents to workflow targeting
        const resp = await fetch(`/api/workflows/${selectedWorkflow}`)
        if (resp.ok) {
          const wf = await resp.json()
          const currentAgents = wf.targeting?.agents || []
          const newAgents = [...new Set([...currentAgents, ...selectedAgents.map(a => a.id)])]
          await fetch(`/api/workflows/${selectedWorkflow}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targeting: { ...wf.targeting, agents: newAgents } }),
          })
        }
      } else if (operation === 'delete' && onDelete) {
        const agents = selectedAgents.map(a => ({ id: a.id, archived: a.archived }))
        await onDelete(agents)
      }

      onClose()
    } catch (err) {
      console.error('Bulk operation failed:', err)
    } finally {
      setProcessing(false)
      setShowConfirm(false)
      setShowSecondConfirm(false)
    }
  }

  function toggleCommunity(name: string) {
    const next = new Set(selectedCommunities)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setSelectedCommunities(next)
  }

  function toggleGroup(name: string) {
    const next = new Set(selectedGroups)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setSelectedGroups(next)
  }

  const filteredModels = availableModels.filter((model) => {
    if (!modelSearch.trim()) return true
    return model.toLowerCase().includes(modelSearch.trim().toLowerCase())
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 px-6 py-4 flex items-center justify-between dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Bulk Operations ({selectedAgents.length} agent{selectedAgents.length !== 1 ? 's' : ''})
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            disabled={processing}
          >
            ×
          </button>
        </div>

        {/* Agent list */}
        <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-700">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">Selected agents:</div>
          <div className="flex flex-wrap gap-2">
            {selectedAgents.map(a => (
              <span
                key={a.id}
                className={`px-2 py-1 rounded text-xs font-medium ${
                  a.archived ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                }`}
              >
                {a.name}{a.archived ? ' (archived)' : ''}
              </span>
            ))}
          </div>
        </div>

        {!showConfirm ? (
          <>
            {/* Operation selection — grouped */}
            <div className="px-6 py-4 space-y-4">

              {/* Quick Actions */}
              {onChat && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">Quick Actions</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => { onChat(selectedAgents.map(a => a.id)); onClose() }} className="text-left px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 bg-white dark:bg-gray-800 transition-colors text-sm">
                      <span className="text-blue-500">💬</span> Chat
                    </button>
                    <button
                      onClick={() => setOperation(operation === 'doctor' ? null : 'doctor')}
                      className={`text-left px-3 py-2 rounded-lg border transition-colors text-sm ${operation === 'doctor' ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-cyan-300 dark:hover:border-cyan-600 bg-white dark:bg-gray-800'}`}
                    >
                      <span className="text-cyan-500">🩺</span> Doctor
                    </button>
                  </div>
                </div>
              )}

              {/* Configure */}
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">Configure</div>
                <div className="grid grid-cols-2 gap-2">
                  {onChangeModel && (
                    <button
                      onClick={() => { if (operation === 'model') { setOperation(null) } else { setOperation('model'); if (availableModels.length === 0) fetchModelsWithByok().then(d => setAvailableModels(d.models || [])).catch(() => {}) } }}
                      className={`text-left px-3 py-2 rounded-lg border transition-colors text-sm ${operation === 'model' ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-cyan-300 bg-white dark:bg-gray-800'}`}
                    >
                      <span className="text-cyan-500">🤖</span> Model
                    </button>
                  )}
                  {onBulkSkills && (
                    <button
                      onClick={() => { if (operation === 'skills') { setOperation(null) } else { setOperation('skills'); if (availableSkills.length === 0) fetch('/api/skills').then(r => r.json()).then(d => setAvailableSkills((d.skills || []).map((s: any) => ({ id: s.id || s.name, name: s.name, emoji: s.emoji })))).catch(() => {}) } }}
                      className={`text-left px-3 py-2 rounded-lg border transition-colors text-sm ${operation === 'skills' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-emerald-300 bg-white dark:bg-gray-800'}`}
                    >
                      <span className="text-emerald-500">🧩</span> Skills
                    </button>
                  )}
                </div>
              </div>

              {/* Organize */}
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">Organize</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setOperation(operation === 'communities' ? null : 'communities')}
                    className={`text-left px-3 py-2 rounded-lg border transition-colors text-sm ${operation === 'communities' ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-purple-300 bg-white dark:bg-gray-800'}`}
                  >
                    <span className="text-purple-500">👥</span> Communities
                  </button>
                  <button
                    onClick={() => setOperation(operation === 'groups' ? null : 'groups')}
                    className={`text-left px-3 py-2 rounded-lg border transition-colors text-sm ${operation === 'groups' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 bg-white dark:bg-gray-800'}`}
                  >
                    <span className="text-indigo-500">📋</span> Groups
                  </button>
                  <button
                    onClick={() => { if (operation === 'workflow') { setOperation(null) } else { setOperation('workflow'); if (availableWorkflows.length === 0) fetch('/api/workflows').then(r => r.json()).then(d => setAvailableWorkflows((d.workflows || []).map((w: any) => ({ id: w.id, name: w.name })))).catch(() => {}) } }}
                    className={`text-left px-3 py-2 rounded-lg border transition-colors text-sm ${operation === 'workflow' ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-sky-300 bg-white dark:bg-gray-800'}`}
                  >
                    <span className="text-sky-500">⚡</span> Workflow
                  </button>
                </div>
              </div>

              {/* Lifecycle */}
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">Lifecycle</div>
                <div className="grid grid-cols-2 gap-2">
                  {onPause && selectedAgents.some(a => !a.paused && !a.archived) && (
                    <button onClick={() => setOperation(operation === 'pause' ? null : 'pause')} className={`text-left px-3 py-2 rounded-lg border transition-colors text-sm ${operation === 'pause' ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-amber-300 bg-white dark:bg-gray-800'}`}>
                      <span className="text-amber-500">⏸</span> Pause
                    </button>
                  )}
                  {onResume && selectedAgents.some(a => a.paused) && (
                    <button onClick={() => setOperation(operation === 'resume' ? null : 'resume')} className={`text-left px-3 py-2 rounded-lg border transition-colors text-sm ${operation === 'resume' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-emerald-300 bg-white dark:bg-gray-800'}`}>
                      <span className="text-emerald-500">▶</span> Resume
                    </button>
                  )}
                  {activeCount > 0 && (
                    <button onClick={() => setOperation(operation === 'archive' ? null : 'archive')} className={`text-left px-3 py-2 rounded-lg border transition-colors text-sm ${operation === 'archive' ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-orange-300 bg-white dark:bg-gray-800'}`}>
                      <span className="text-orange-500">📦</span> Archive
                    </button>
                  )}
                  {archivedCount > 0 && (
                    <button onClick={() => setOperation(operation === 'unarchive' ? null : 'unarchive')} className={`text-left px-3 py-2 rounded-lg border transition-colors text-sm ${operation === 'unarchive' ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-green-300 bg-white dark:bg-gray-800'}`}>
                      <span className="text-green-500">📤</span> Unarchive
                    </button>
                  )}
                  {onDelete && (
                    <button onClick={() => setOperation(operation === 'delete' ? null : 'delete')} className={`text-left px-3 py-2 rounded-lg border transition-colors text-sm col-span-2 ${operation === 'delete' ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-red-300 bg-white dark:bg-gray-800'}`}>
                      <span className="text-red-500">🗑</span> <span className="text-red-600 dark:text-red-400">Delete Permanently</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Communities selection */}
            {operation === 'communities' && (
              <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700">
                <div className="text-sm font-medium text-gray-700 mb-3 dark:text-gray-300">Select communities:</div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {allCommunities.map(c => (
                    <label key={c.name} className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer dark:bg-gray-900 dark:hover:bg-gray-700">
                      <input
                        type="checkbox"
                        checked={selectedCommunities.has(c.name)}
                        onChange={() => toggleCommunity(c.name)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900 dark:text-gray-100">{c.name}</div>
                        {c.description && <div className="text-sm text-gray-500 dark:text-gray-400">{c.description}</div>}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Groups selection */}
            {operation === 'groups' && (
              <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700">
                <div className="text-sm font-medium text-gray-700 mb-3 dark:text-gray-300">Select groups:</div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {allGroups.map(g => (
                    <label key={g.name} className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer dark:bg-gray-900 dark:hover:bg-gray-700">
                      <input
                        type="checkbox"
                        checked={selectedGroups.has(g.name)}
                        onChange={() => toggleGroup(g.name)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900 dark:text-gray-100">{g.name}</div>
                        {g.description && <div className="text-sm text-gray-500 dark:text-gray-400">{g.description}</div>}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Model selection */}
            {operation === 'model' && (
              <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700">
                <div className="text-sm font-medium text-gray-700 mb-3 dark:text-gray-300">Select model:</div>
                <div className="relative mb-3">
                  <input
                    type="text"
                    value={modelSearch}
                    onChange={e => setModelSearch(e.target.value)}
                    placeholder="Search models..."
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 pr-9 text-sm text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                  {modelSearch && (
                    <button
                      type="button"
                      onClick={() => setModelSearch('')}
                      className="absolute inset-y-0 right-2 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                      aria-label="Clear model search"
                    >
                      ×
                    </button>
                  )}
                </div>
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {availableModels.length === 0 && (
                    <div className="text-sm text-gray-400">Loading models...</div>
                  )}
                  {availableModels.length > 0 && filteredModels.length === 0 && (
                    <div className="text-sm text-gray-400">No models match your search.</div>
                  )}
                  {filteredModels.map(model => (
                    <label key={model} className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors ${selectedModel === model ? 'bg-cyan-50 dark:bg-cyan-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                      <input
                        type="radio"
                        name="bulk-model"
                        checked={selectedModel === model}
                        onChange={() => setSelectedModel(model)}
                        className="text-cyan-600"
                      />
                      <span className="text-sm font-mono text-gray-700 dark:text-gray-200">{model}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Skills selection */}
            {operation === 'skills' && (
              <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700">
                <div className="text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">Select skills to add:</div>
                <input
                  type="text"
                  value={skillSearch}
                  onChange={e => setSkillSearch(e.target.value)}
                  placeholder="Search skills..."
                  className="w-full mb-2 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {availableSkills.length === 0 && <div className="text-sm text-gray-400">Loading skills...</div>}
                  {availableSkills
                    .filter(s => !skillSearch || s.name.toLowerCase().includes(skillSearch.toLowerCase()) || s.id.toLowerCase().includes(skillSearch.toLowerCase()))
                    .map(skill => (
                    <label key={skill.id} className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors text-sm ${selectedSkillsToAdd.has(skill.id) ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                      <input
                        type="checkbox"
                        checked={selectedSkillsToAdd.has(skill.id)}
                        onChange={() => {
                          const next = new Set(selectedSkillsToAdd)
                          if (next.has(skill.id)) next.delete(skill.id)
                          else next.add(skill.id)
                          setSelectedSkillsToAdd(next)
                        }}
                        className="text-emerald-600"
                      />
                      <span>{skill.emoji || '🔧'}</span>
                      <span className="text-gray-700 dark:text-gray-200">{skill.name}</span>
                      <span className="text-gray-400 text-xs font-mono">({skill.id})</span>
                    </label>
                  ))}
                </div>
                {selectedSkillsToAdd.size > 0 && (
                  <div className="mt-2 text-xs text-emerald-600">{selectedSkillsToAdd.size} skill{selectedSkillsToAdd.size !== 1 ? 's' : ''} selected</div>
                )}
              </div>
            )}

            {/* Workflow selection */}
            {operation === 'workflow' && (
              <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700">
                <div className="text-sm font-medium text-gray-700 mb-3 dark:text-gray-300">Add agents to workflow:</div>
                {availableWorkflows.length > 0 ? (
                  <select
                    value={selectedWorkflow}
                    onChange={e => setSelectedWorkflow(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                  >
                    <option value="">Select a workflow...</option>
                    {availableWorkflows.map(w => <option key={w.id} value={w.id}>{w.name} ({w.id})</option>)}
                  </select>
                ) : (
                  <div className="text-sm text-gray-400">No workflows found</div>
                )}
              </div>
            )}

            {/* Doctor results */}
            {operation === 'doctor' && doctorResults && (
              <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700">
                <div className="text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">
                  Doctor Results: {doctorResults.summary?.pass || 0} pass, {doctorResults.summary?.fail || 0} fail, {doctorResults.summary?.fixed || 0} fixed
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {(doctorResults.results || []).map((r: any) => (
                    <div key={r.id} className="text-xs">
                      <span className="font-mono font-medium text-gray-700 dark:text-gray-300">{r.id}: </span>
                      {(r.checks || []).map((c: any, i: number) => (
                        <span key={i} className={`mr-2 ${c.status === 'pass' ? 'text-green-500' : c.status === 'fixed' ? 'text-cyan-500' : c.status === 'fail' ? 'text-red-500' : 'text-amber-500'}`}>
                          {c.status === 'pass' ? '✓' : c.status === 'fixed' ? '⟳' : c.status === 'fail' ? '✗' : '⚠'} {c.check}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 px-6 py-4 flex gap-3 justify-end dark:border-gray-700">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium dark:text-gray-100 dark:text-gray-300"
                disabled={processing}
              >
                Cancel
              </button>
              <button
                onClick={handleFirstConfirm}
                disabled={
                  processing ||
                  !operation ||
                  (operation === 'communities' && selectedCommunities.size === 0) ||
                  (operation === 'groups' && selectedGroups.size === 0) ||
                  (operation === 'model' && !selectedModel) ||
                  (operation === 'skills' && selectedSkillsToAdd.size === 0)
                }
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {processing ? 'Loading...' : 'Next →'}
              </button>
            </div>
          </>
        ) : !showSecondConfirm ? (
          <>
            {/* First Confirmation screen */}
            <div className="px-6 py-6">
              <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <div className="text-yellow-600 text-xl">⚠️</div>
                  <div>
                    <div className="font-medium text-yellow-900 mb-1">Confirm Bulk Operation</div>
                    <div className="text-sm text-yellow-800">
                      You are about to perform the following operation on {selectedAgents.length} agent{selectedAgents.length !== 1 ? 's' : ''}:
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Operation:</div>
                  <div className="text-base text-gray-900 dark:text-gray-100">
                    {operation === 'communities' && `Add to ${selectedCommunities.size} communit${selectedCommunities.size !== 1 ? 'ies' : 'y'}`}
                    {operation === 'groups' && `Add to ${selectedGroups.size} group${selectedGroups.size !== 1 ? 's' : ''}`}
                    {operation === 'archive' && `Archive ${activeCount} agent${activeCount !== 1 ? 's' : ''}`}
                    {operation === 'unarchive' && `Unarchive ${archivedCount} agent${archivedCount !== 1 ? 's' : ''}`}
                    {operation === 'pause' && `Pause ${selectedAgents.filter(a => !a.paused && !a.archived).length} agent${selectedAgents.filter(a => !a.paused && !a.archived).length !== 1 ? 's' : ''}`}
                    {operation === 'resume' && `Resume ${selectedAgents.filter(a => a.paused).length} agent${selectedAgents.filter(a => a.paused).length !== 1 ? 's' : ''}`}
                    {operation === 'skills' && `Add ${selectedSkillsToAdd.size} skill${selectedSkillsToAdd.size !== 1 ? 's' : ''} to ${selectedAgents.length} agent${selectedAgents.length !== 1 ? 's' : ''}`}
                    {operation === 'model' && `Change model to ${selectedModel} for ${selectedAgents.length} agent${selectedAgents.length !== 1 ? 's' : ''}`}
                    {operation === 'doctor' && `Run doctor + auto-fix on ${selectedAgents.length} agent${selectedAgents.length !== 1 ? 's' : ''}`}
                    {operation === 'workflow' && `Add ${selectedAgents.length} agent${selectedAgents.length !== 1 ? 's' : ''} to workflow "${selectedWorkflow}"`}
                  </div>
                </div>

                {operation === 'communities' && (
                  <div>
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Communities:</div>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {Array.from(selectedCommunities).map(name => (
                        <span key={name} className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-sm font-medium">
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {operation === 'groups' && (
                  <div>
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Groups:</div>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {Array.from(selectedGroups).map(name => (
                        <span key={name} className="px-2 py-1 bg-indigo-100 text-indigo-800 rounded text-sm font-medium">
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Confirmation footer */}
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 px-6 py-4 flex gap-3 justify-end dark:border-gray-700">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium dark:text-gray-100 dark:text-gray-300"
                disabled={processing}
              >
                ← Back
              </button>
              <button
                onClick={handleExecute}
                disabled={processing}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {processing ? `${processingLabel}...` : 'Confirm & Execute'}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Second Confirmation screen (for delete only) */}
            <div className="px-6 py-6">
              <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-700 rounded-lg">
                <div className="flex items-start gap-3">
                  <div className="text-red-600 text-2xl">🚨</div>
                  <div>
                    <div className="font-bold text-red-900 mb-2 text-lg">FINAL WARNING: Permanent Deletion</div>
                    <div className="text-sm text-red-800 space-y-1">
                      <p>You are about to <strong>permanently delete {selectedAgents.length} agent{selectedAgents.length !== 1 ? 's' : ''}</strong>.</p>
                      <p className="font-semibold">This action CANNOT be undone!</p>
                    </div>
                  </div>
                </div>
              </div>

              {deleteImpact && (
                <div className="space-y-3 mb-4">
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Impact Summary:</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-gray-50 rounded border border-gray-200 dark:border-gray-700 dark:bg-gray-900">
                      <div className="text-xs text-gray-500 dark:text-gray-400">Agents to delete</div>
                      <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{deleteImpact.agentCount}</div>
                    </div>
                    <div className="p-3 bg-purple-50 rounded border border-purple-200">
                      <div className="text-xs text-purple-600">Community memberships</div>
                      <div className="text-2xl font-bold text-purple-900">{deleteImpact.totalCommunities}</div>
                    </div>
                    <div className="p-3 bg-indigo-50 rounded border border-indigo-200">
                      <div className="text-xs text-indigo-600">Group memberships</div>
                      <div className="text-2xl font-bold text-indigo-900">{deleteImpact.totalGroups}</div>
                    </div>
                    <div className="p-3 bg-orange-50 rounded border border-orange-200">
                      <div className="text-xs text-orange-600">TODOs/notes</div>
                      <div className="text-2xl font-bold text-orange-900">{deleteImpact.totalTodos}</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="p-4 bg-gray-50 rounded border border-gray-200 dark:border-gray-700 dark:bg-gray-900">
                <div className="text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">Agents to be deleted:</div>
                <div className="flex flex-wrap gap-2">
                  {selectedAgents.map(a => (
                    <span
                      key={a.id}
                      className="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800"
                    >
                      {a.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Second confirmation footer */}
            <div className="sticky bottom-0 bg-red-50 dark:bg-red-900/20 border-t-2 border-red-200 dark:border-red-800 px-6 py-4 flex gap-3 justify-end">
              <button
                onClick={() => setShowSecondConfirm(false)}
                className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium dark:text-gray-100 dark:text-gray-300"
                disabled={processing}
              >
                ← Cancel
              </button>
              <button
                onClick={handleExecute}
                disabled={processing}
                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-bold shadow-lg"
              >
                {processing ? 'Deleting...' : '🗑️ Delete Permanently'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
