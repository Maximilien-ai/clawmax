import React, { useState } from 'react'
import { useToast } from './Toast'

interface Agent {
  id: string
  name: string
  tags: string[]
}

interface SaveAsTemplatePanelProps {
  agent: Agent | null
  onClose: () => void
  onSuccess: () => void
}

export default function SaveAsTemplatePanel({ agent, onClose, onSuccess }: SaveAsTemplatePanelProps) {
  const { showSuccess, showError } = useToast()
  const [templateName, setTemplateName] = useState(agent ? `${agent.name} Template` : '')
  const [description, setDescription] = useState('')
  const [author, setAuthor] = useState('')
  const [tags, setTags] = useState(agent?.tags?.join(', ') || '')
  const [saving, setSaving] = useState(false)

  if (!agent) return null

  const handleSave = async () => {
    if (!templateName.trim()) {
      showError('Template name is required')
      return
    }

    setSaving(true)
    try {
      const tagArray = tags.split(',').map(t => t.trim()).filter(t => t)

      const resp = await fetch(`/api/templates/agents/${agent.id}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: templateName.trim(),
          description: description.trim() || undefined,
          author: author.trim() || undefined,
          tags: tagArray.length > 0 ? tagArray : undefined,
        }),
      })

      if (!resp.ok) {
        const data = await resp.json()
        throw new Error(data.error || 'Failed to save template')
      }

      const data = await resp.json()
      showSuccess(`Template "${templateName}" saved successfully!`)
      // Notify Templates page to refresh
      window.dispatchEvent(new Event('template-created'))
      onSuccess()
      onClose()
    } catch (err: any) {
      showError(err.message || 'Failed to save template')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          💾 Save "{agent.name}" as Template
        </h2>

        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Template Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="e.g., Senior Software Engineer"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this template for?"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Author
            </label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Your name (optional)"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tags
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="engineer, golang, backend (comma-separated)"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            <p className="text-xs text-gray-500 mt-1">Comma-separated tags for searchability</p>
          </div>

          <div className="bg-sky-50 border border-sky-200 rounded-md p-3">
            <p className="text-xs text-sky-700">
              <strong>What gets saved:</strong> SOUL.md, TOOLS.md, IDENTITY.md, tags, and metadata from agent "{agent.id}"
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !templateName.trim()}
            className="flex-1 px-4 py-2 bg-sky-500 text-white rounded-md hover:bg-sky-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Template'}
          </button>
        </div>
      </div>
    </div>
  )
}
