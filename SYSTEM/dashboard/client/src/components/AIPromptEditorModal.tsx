import React, { useEffect, useState } from 'react'

type PromptExpandFormat = 'markdown' | 'text'

interface AIPromptEditorModalProps {
  isOpen: boolean
  title?: string
  initialValue: string
  onClose: () => void
  onSave: (value: string) => void
  onSaveAndGenerate?: (value: string) => void
  onExpandWithAi?: (value: string, format: PromptExpandFormat) => Promise<string>
  saveLabel?: string
  saveAndGenerateLabel?: string
  expandLabel?: string
  placeholder?: string
  rows?: number
  savingAndGenerating?: boolean
  generateDisabled?: boolean
}

export default function AIPromptEditorModal({
  isOpen,
  title = 'Edit AI Prompt',
  initialValue,
  onClose,
  onSave,
  onSaveAndGenerate,
  onExpandWithAi,
  saveLabel = 'Save',
  saveAndGenerateLabel = 'Save & Generate',
  placeholder,
  rows = 14,
  savingAndGenerating = false,
  generateDisabled = false,
  expandLabel = 'Expand with AI',
}: AIPromptEditorModalProps) {
  const [draft, setDraft] = useState(initialValue)
  const [expanding, setExpanding] = useState(false)
  const [expandFormat, setExpandFormat] = useState<PromptExpandFormat>('markdown')
  const [expandError, setExpandError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setDraft(initialValue)
      setExpandFormat('markdown')
      setExpandError(null)
    }
  }, [initialValue, isOpen])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-lg bg-white shadow-2xl dark:bg-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:text-gray-400"
          >
            ✕
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={rows}
            placeholder={placeholder}
            className="w-full resize-y rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 focus:ring-2 focus:ring-purple-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          <div className="flex justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                onSave(draft)
                onClose()
              }}
              className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              {saveLabel}
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              {onSaveAndGenerate ? (
                <button
                  type="button"
                  onClick={() => {
                    onSaveAndGenerate(draft)
                    onClose()
                  }}
                  disabled={savingAndGenerating || generateDisabled || !draft.trim()}
                  className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingAndGenerating ? 'Generating…' : saveAndGenerateLabel}
                </button>
              ) : null}
            </div>
          </div>
          {onExpandWithAi ? (
            <div className="space-y-3">
              <div className="flex items-center justify-start gap-3">
              <select
                value={expandFormat}
                onChange={(e) => setExpandFormat(e.target.value as PromptExpandFormat)}
                className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
              >
                <option value="markdown">Markdown</option>
                <option value="text">Plain text</option>
              </select>
              <button
                type="button"
                onClick={async () => {
                  if (!draft.trim() || expanding) return
                  setExpanding(true)
                  setExpandError(null)
                  try {
                    const expanded = await onExpandWithAi(draft, expandFormat)
                    setDraft(expanded)
                  } catch (err: any) {
                    setExpandError(err?.message || 'Failed to expand prompt')
                  } finally {
                    setExpanding(false)
                  }
                }}
                disabled={expanding || !draft.trim()}
                className="rounded-md border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-medium text-purple-700 hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-purple-800 dark:bg-purple-900/20 dark:text-purple-200 dark:hover:bg-purple-900/30"
              >
                {expanding ? 'Expanding…' : expandLabel}
              </button>
            </div>
              {expandError ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
                  {expandError}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
