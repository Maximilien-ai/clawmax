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
  const [creating, setCreating] = useState(false)

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
      await createWorkspace(name.trim(), finalPath, {
        color: selectedColor,
        tags: []
      })

      // Reset form and close
      setName('')
      setPath('')
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
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Create New Workspace</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name input */}
          <div>
            <label htmlFor="workspace-name" className="block text-sm font-medium text-gray-700 mb-1">
              Workspace Name *
            </label>
            <input
              id="workspace-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Work, Personal, Client Project"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              autoFocus
            />
          </div>

          {/* Path input */}
          <div>
            <label htmlFor="workspace-path" className="block text-sm font-medium text-gray-700 mb-1">
              Path (optional)
            </label>
            <input
              id="workspace-path"
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="Auto-generated from name"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">
              Leave blank to auto-generate: ~/.openclaw/workspaces/workspace-name
            </p>
          </div>

          {/* Color picker */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
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

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={() => {
                setName('')
                setPath('')
                setSelectedColor(PRESET_COLORS[0].value)
                onClose()
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
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
