import React, { useState, useEffect } from 'react'
import { useWorkspace, type Workspace } from '../contexts/WorkspaceContext'
import { loadWorkspaceBudget, parseWorkspaceBudgetLimit, saveWorkspaceBudget, type WorkspaceBudgetSnapshot } from '../lib/workspaceBudget'
import { MobileSafeDialog } from './MobileSafeDialog'

const PRESET_COLORS = [
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Green', value: '#10B981' },
  { name: 'Orange', value: '#F59E0B' },
  { name: 'Red', value: '#EF4444' },
  { name: 'Purple', value: '#8B5CF6' },
  { name: 'Pink', value: '#EC4899' },
]

export function WorkspaceEditDialog({
  workspace,
  isOpen,
  onClose
}: {
  workspace: Workspace
  isOpen: boolean
  onClose: () => void
}) {
  const { updateWorkspace } = useWorkspace()
  const [name, setName] = useState(workspace.name)
  const [selectedColor, setSelectedColor] = useState(workspace.color || PRESET_COLORS[0].value)
  const [tags, setTags] = useState(workspace.tags?.join(', ') || '')
  const [updating, setUpdating] = useState(false)
  const [budgetLimit, setBudgetLimit] = useState('10')
  const [budgetEnforced, setBudgetEnforced] = useState(true)
  const [budgetSpend, setBudgetSpend] = useState(0)
  const [budgetPct, setBudgetPct] = useState(0)
  const [budgetLevel, setBudgetLevel] = useState<'ok' | 'warning' | 'exceeded'>('ok')
  const [budgetEnabled, setBudgetEnabled] = useState(true)
  const [saveError, setSaveError] = useState('')
  const [savedBudget, setSavedBudget] = useState<WorkspaceBudgetSnapshot | null>(null)
  const [budgetLoading, setBudgetLoading] = useState(false)
  const [budgetLoadError, setBudgetLoadError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    if (!isOpen) return
    setName(workspace.name)
    setSelectedColor(workspace.color || PRESET_COLORS[0].value)
    setTags(workspace.tags?.join(', ') || '')
    setSaveError('')
    // Metadata drafts are reset only when opening another workspace, not on budget retry.
  }, [isOpen, workspace.id])

  useEffect(() => {
    if (!isOpen) return
    const controller = new AbortController()
    setSavedBudget(null)
    setBudgetLoading(true)
    setBudgetLoadError('')
    loadWorkspaceBudget(workspace.id, controller.signal).then(data => {
      if (controller.signal.aborted) return
      setSavedBudget(data)
      setBudgetEnabled(data.enabled)
      if (data.enabled) {
        setBudgetLimit(String(data.config.limitUsd))
        setBudgetEnforced(data.config.enforced)
        setBudgetSpend(data.currentSpendUsd)
        setBudgetPct(data.usedPct)
        setBudgetLevel(data.level)
      }
    }).catch(error => {
      if (!controller.signal.aborted) setBudgetLoadError(error instanceof Error ? error.message : 'Workspace budget could not be loaded.')
    }).finally(() => {
      if (!controller.signal.aborted) setBudgetLoading(false)
    })
    return () => controller.abort()
  }, [isOpen, workspace.id, loadAttempt])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      return
    }

    setUpdating(true)
    setSaveError('')
    try {
      // Parse tags from comma-separated string
      const parsedTags = tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0)

      const limit = savedBudget?.enabled ? parseWorkspaceBudgetLimit(budgetLimit) : null
      if (savedBudget?.enabled && (limit !== savedBudget.config.limitUsd || budgetEnforced !== savedBudget.config.enforced)) {
        await saveWorkspaceBudget(workspace.id, budgetLimit, budgetEnforced)
        setSavedBudget({ ...savedBudget, config: { limitUsd: Number(budgetLimit), enforced: budgetEnforced } })
      }

      await updateWorkspace(workspace.id, {
        name: name.trim(),
        color: selectedColor,
        tags: parsedTags
      })

      onClose()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Workspace changes could not be saved.')
    } finally {
      setUpdating(false)
    }
  }

  return (
    <MobileSafeDialog
      ariaLabelledBy="workspace-edit-title"
      panelClassName="max-w-md"
      header={<h2 id="workspace-edit-title" className="text-xl font-bold text-gray-900 dark:text-gray-100">Edit Workspace</h2>}
      footer={<div className="flex items-center justify-end gap-3">
        <button type="button" onClick={onClose} disabled={updating} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">Cancel</button>
        <button type="submit" form="workspace-edit-form" disabled={!name.trim() || updating} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">
          {updating ? 'Updating...' : 'Update Workspace'}
        </button>
      </div>}
    >
        <form id="workspace-edit-form" onSubmit={handleSubmit} className="space-y-4">
          {/* Name input */}
          <div>
            <label htmlFor="workspace-name" className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
              Workspace Name *
            </label>
            <input
              id="workspace-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Work, Personal, Client Project"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600"
              required
              autoFocus
            />
          </div>

          {/* Tags input */}
          <div>
            <label htmlFor="workspace-tags" className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
              Tags (optional)
            </label>
            <input
              id="workspace-tags"
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g., personal, work, sandbox"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm dark:border-gray-600"
            />
            <p className="mt-1 text-xs text-gray-500">
              Comma-separated tags for organizing workspaces
            </p>
          </div>

          {/* Color picker */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">
              Color
            </label>
            <div className="flex gap-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => setSelectedColor(color.value)}
                  className={`w-8 h-8 rounded-full transition-all ${
                    selectedColor === color.value
                      ? 'ring-2 ring-offset-2 ring-blue-500 scale-110'
                      : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: color.value }}
                  title={color.name}
                />
              ))}
            </div>
          </div>

          {budgetLoading && <p role="status" className="text-sm text-gray-500">Loading saved budget…</p>}
          {budgetLoadError && <div role="alert" className="text-sm text-red-700 dark:text-red-300">
            <p>{budgetLoadError} You can still save workspace details; the saved budget will stay unchanged.</p>
            <button type="button" disabled={updating} onClick={() => setLoadAttempt(value => value + 1)} className="mt-2 underline">Retry loading budget</button>
          </div>}
          {budgetEnabled && savedBudget?.enabled && (
          <div>
            <label htmlFor="workspace-budget" className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
              Cost Budget (USD)
            </label>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 flex-1">
                <span className="text-sm text-gray-500">$</span>
                <input
                  id="workspace-budget"
                  type="number"
                  value={budgetLimit}
                  onChange={(e) => setBudgetLimit(e.target.value)}
                  placeholder="10.00"
                  min="0"
                  step="1"
                  disabled={updating}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                <input
                  type="checkbox"
                  disabled={updating}
                  checked={budgetEnforced}
                  onChange={(e) => setBudgetEnforced(e.target.checked)}
                  className="rounded"
                />
                Enforce limit
              </label>
            </div>
            {/* Mini progress bar */}
            <div className="mt-2">
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    budgetLevel === 'exceeded' ? 'bg-red-500' :
                    budgetLevel === 'warning' ? 'bg-yellow-500' :
                    'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(budgetPct, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>${budgetSpend.toFixed(2)} spent</span>
                <span>{budgetPct.toFixed(1)}%</span>
              </div>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Agents pause automatically when an enforced positive budget is exceeded. Warning at 80%. Zero sets no positive spending cap.
            </p>
          </div>
          )}

          {/* Path info (read-only) */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-900">Path cannot be changed</p>
                <p className="text-xs text-amber-700 mt-1 font-mono break-all">{workspace.path}</p>
                <p className="text-xs text-amber-600 mt-1">
                  Changing the workspace path would break agent connections and data references.
                </p>
              </div>
            </div>
          </div>

          {saveError && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{saveError}</p>}

        </form>
    </MobileSafeDialog>
  )
}
