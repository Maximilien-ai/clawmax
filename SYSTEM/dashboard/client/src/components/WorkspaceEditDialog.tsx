import React, { useState } from 'react'
import { useWorkspace, type Workspace } from '../contexts/WorkspaceContext'

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

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      return
    }

    setUpdating(true)
    try {
      // Parse tags from comma-separated string
      const parsedTags = tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0)

      await updateWorkspace(workspace.id, {
        name: name.trim(),
        color: selectedColor,
        tags: parsedTags
      })

      onClose()
    } catch (err) {
      // Error is already shown by the context
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4 dark:text-gray-100">Edit Workspace</h2>

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

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors dark:text-gray-100 dark:text-gray-300"
              disabled={updating}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || updating}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {updating ? 'Updating...' : 'Update Workspace'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
