import React, { useEffect, useState } from 'react'
import { useWorkspace, WorkspaceCreateError, type Workspace } from '../contexts/WorkspaceContext'
import { buildWorkspaceScopedPath } from '../lib/workspaceScope'
import { parseWorkspaceBudgetLimit, saveWorkspaceBudget } from '../lib/workspaceBudget'
import { useToast } from './Toast'
import { MobileSafeDialog } from './MobileSafeDialog'

const PRESET_COLORS = [
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Green', value: '#10B981' },
  { name: 'Orange', value: '#F59E0B' },
  { name: 'Red', value: '#EF4444' },
  { name: 'Purple', value: '#8B5CF6' },
  { name: 'Pink', value: '#EC4899' },
]

export function WorkspaceDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { activeWorkspace, createWorkspace, switchWorkspace } = useWorkspace()
  const { showSuccess } = useToast()
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0].value)
  const [tags, setTags] = useState('')
  const [creating, setCreating] = useState(false)
  const [budgetLimit, setBudgetLimit] = useState('10')
  const [budgetEnforced, setBudgetEnforced] = useState(true)
  const [budgetEnabled, setBudgetEnabled] = useState(true)
  const [conflict, setConflict] = useState<any | null>(null)
  const [createdWorkspace, setCreatedWorkspace] = useState<Workspace | null>(null)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    if (!isOpen) return
    fetch(buildWorkspaceScopedPath('/api/budget', activeWorkspace?.id))
      .then(r => r.json())
      .then(d => setBudgetEnabled(!(d && d.enabled === false)))
      .catch(() => {})
  }, [activeWorkspace?.id, isOpen])

  if (!isOpen) return null

  const submitCreation = async (mode?: 'overwrite') => {
    if (!name.trim()) {
      return
    }

    // Auto-generate path if not provided - backend will handle the full path
    const finalPath = path.trim() || `~/.openclaw/workspaces/${name.toLowerCase().replace(/\s+/g, '-')}`

    setCreating(true)
    setConflict(null)
    setSaveError('')
    let workspace = createdWorkspace
    try {
      if (budgetEnabled) parseWorkspaceBudgetLimit(budgetLimit)
      // Parse tags from comma-separated string
      const parsedTags = tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0)

      if (!workspace) workspace = await createWorkspace(name.trim(), finalPath, {
        color: selectedColor,
        tags: parsedTags,
        mode,
        notifySuccess: false,
      })
      setCreatedWorkspace(workspace)
      if (budgetEnabled) await saveWorkspaceBudget(workspace.id, budgetLimit, budgetEnforced)

      // Reset form and close
      showSuccess(`Workspace "${workspace.name}" created successfully`)
      resetForm()
      onClose()
    } catch (err) {
      if (err instanceof WorkspaceCreateError && err.code === 'WORKSPACE_PATH_CONFLICT') {
        setConflict(err.conflict || null)
      } else {
        const message = err instanceof Error ? err.message : 'Workspace changes could not be saved.'
        setSaveError(workspace ? `Workspace "${workspace.name}" was created, but its budget was not saved. ${message} Retry to finish saving the budget.` : message)
      }
    } finally {
      setCreating(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await submitCreation()
  }

  const resetForm = () => {
    setName('')
    setPath('')
    setTags('')
    setBudgetLimit('10')
    setBudgetEnforced(true)
    setSelectedColor(PRESET_COLORS[0].value)
    setConflict(null)
    setCreatedWorkspace(null)
    setSaveError('')
  }

  const handleAdopt = async () => {
    const finalPath = path.trim() || `~/.openclaw/workspaces/${name.toLowerCase().replace(/\s+/g, '-')}`
    setCreating(true)
    try {
      const parsedTags = tags.split(',').map(t => t.trim()).filter(t => t.length > 0)
      await createWorkspace(name.trim(), finalPath, {
        color: selectedColor,
        tags: parsedTags,
        mode: 'adopt'
      })
      resetForm()
      onClose()
    } finally {
      setCreating(false)
    }
  }

  const handleOpenExisting = async () => {
    const existingId = conflict?.registeredWorkspace?.id
    if (!existingId) return
    await switchWorkspace(existingId)
  }

  const handleOverwrite = async () => {
    await submitCreation('overwrite')
  }

  return (
    <MobileSafeDialog
      ariaLabelledBy="workspace-create-title"
      panelClassName="max-w-md"
      header={<h2 id="workspace-create-title" className="text-xl font-bold text-gray-900 dark:text-gray-100">Create New Workspace</h2>}
      footer={
          <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => {
                resetForm()
                onClose()
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors dark:text-gray-100 dark:text-gray-300"
              disabled={creating}
            >
              {createdWorkspace ? 'Close' : 'Cancel'}
            </button>
            <button
              type="submit" form="workspace-create-form"
              disabled={!name.trim() || creating}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? (createdWorkspace ? 'Saving budget...' : 'Creating...') : createdWorkspace ? 'Retry Budget Save' : 'Create Workspace'}
            </button>
          </div>
      }
    >

        <form id="workspace-create-form" onSubmit={handleSubmit} className="space-y-4">
          {/* Name input */}
          <div>
            <label htmlFor="workspace-name" className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
              Workspace Name *
            </label>
            <input
              id="workspace-name"
              disabled={creating || Boolean(createdWorkspace)}
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setConflict(null)
              }}
              placeholder="e.g., Work, Personal, Client Project"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600"
              required
              autoFocus
            />
          </div>

          {/* Path input */}
          <div>
            <label htmlFor="workspace-path" className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
              Path (optional)
            </label>
            <input
              id="workspace-path"
              disabled={creating || Boolean(createdWorkspace)}
              type="text"
              value={path}
              onChange={(e) => {
                setPath(e.target.value)
                setConflict(null)
              }}
              placeholder="Auto-generated from name"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm dark:border-gray-600"
            />
            <p className="mt-1 text-xs text-gray-500">
              Leave blank to auto-generate: ~/.openclaw/workspaces/workspace-name
            </p>
          </div>

          {/* Tags input */}
          <div>
            <label htmlFor="workspace-tags" className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
              Tags (optional)
            </label>
            <input
              id="workspace-tags"
              disabled={creating || Boolean(createdWorkspace)}
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
                  disabled={creating || Boolean(createdWorkspace)}
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

          {budgetEnabled && (
          <div>
            <label htmlFor="workspace-budget" className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
              Cost Budget (USD)
            </label>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 flex-1">
                <span className="text-sm text-gray-500">$</span>
                <input
                  id="workspace-budget"
                  disabled={creating}
                  type="number"
                  value={budgetLimit}
                  onChange={(e) => setBudgetLimit(e.target.value)}
                  placeholder="10.00"
                  min="0"
                  step="1"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                <input
                  type="checkbox"
                  disabled={creating}
                  checked={budgetEnforced}
                  onChange={(e) => setBudgetEnforced(e.target.checked)}
                  className="rounded"
                />
                Enforce limit
              </label>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {budgetLimit.trim() === '0' ? 'Zero sets no positive spending cap.' : 'Agents pause automatically when budget is exceeded. Warning at 80%.'}
            </p>
          </div>
          )}

          {saveError && <p role="alert" className="text-sm text-red-700 dark:text-red-300 break-words">{saveError}</p>}

        </form>

        {conflict && (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
            <div className="font-semibold">Workspace path conflict</div>
            <div className="mt-1 font-mono text-xs break-all">{conflict.path}</div>
            {conflict.registeredWorkspace ? (
              <div className="mt-2">
                This path is already registered as workspace <span className="font-semibold">{conflict.registeredWorkspace.name}</span>.
              </div>
            ) : (
              <div className="mt-2">
                This path already contains a real workspace with agents, workflows, or templates.
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {conflict.registeredWorkspace && (
                <button
                  type="button"
                  onClick={handleOpenExisting}
                  className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  disabled={creating}
                >
                  Open Existing
                </button>
              )}
              {conflict.canAdopt && (
                <button
                  type="button"
                  onClick={handleAdopt}
                  className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-black dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
                  disabled={creating}
                >
                  Use Existing
                </button>
              )}
              {conflict.canOverwrite && (
                <button
                  type="button"
                  onClick={handleOverwrite}
                  className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
                  disabled={creating}
                >
                  Overwrite
                </button>
              )}
            </div>
          </div>
        )}
    </MobileSafeDialog>
  )
}
