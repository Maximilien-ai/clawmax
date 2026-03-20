import React, { useState } from 'react'
import { useWorkspace } from '../contexts/WorkspaceContext'

const PRESET_COLORS = [
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Green', value: '#10B981' },
  { name: 'Orange', value: '#F59E0B' },
  { name: 'Red', value: '#EF4444' },
  { name: 'Purple', value: '#8B5CF6' },
  { name: 'Pink', value: '#EC4899' },
]

export function WorkspaceDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { createWorkspace } = useWorkspace()
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0].value)
  const [tags, setTags] = useState('')
  const [creating, setCreating] = useState(false)
  const [budgetLimit, setBudgetLimit] = useState('10')
  const [budgetEnforced, setBudgetEnforced] = useState(true)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      return
    }

    // Auto-generate path if not provided - backend will handle the full path
    const finalPath = path.trim() || `~/.openclaw/workspaces/${name.toLowerCase().replace(/\s+/g, '-')}`

    setCreating(true)
    try {
      // Parse tags from comma-separated string
      const parsedTags = tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0)

      await createWorkspace(name.trim(), finalPath, {
        color: selectedColor,
        tags: parsedTags
      })

      // Save budget config for the new workspace
      try {
        await fetch('/api/budget', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            limitUsd: parseFloat(budgetLimit) || 10,
            enforced: budgetEnforced,
          }),
        })
      } catch {}

      // Reset form and close
      setName('')
      setPath('')
      setTags('')
      setBudgetLimit('10')
      setBudgetEnforced(true)
      setSelectedColor(PRESET_COLORS[0].value)
      onClose()
    } catch (err) {
      // Error is already shown by the context
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4 dark:text-gray-100">Create New Workspace</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
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

          {/* Path input */}
          <div>
            <label htmlFor="workspace-path" className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
              Path (optional)
            </label>
            <input
              id="workspace-path"
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
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

          {/* Cost Budget */}
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
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={budgetEnforced}
                  onChange={(e) => setBudgetEnforced(e.target.checked)}
                  className="rounded"
                />
                Enforce limit
              </label>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Agents pause automatically when budget is exceeded. Warning at 80%.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => {
                setName('')
                setPath('')
                setTags('')
                setSelectedColor(PRESET_COLORS[0].value)
                onClose()
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors dark:text-gray-100 dark:text-gray-300"
              disabled={creating}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || creating}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? 'Creating...' : 'Create Workspace'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
