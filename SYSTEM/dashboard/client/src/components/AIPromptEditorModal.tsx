import React, { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { appendPromptAttachmentContext, createPromptAttachment, type PromptAttachment } from '../lib/promptAttachments'

type PromptExpandFormat = 'markdown' | 'text'

interface AIPromptEditorModalProps {
  isOpen: boolean
  title?: string
  initialValue: string
  onClose: () => void
  onSave: (value: string) => void
  onSaveAndGenerate?: (value: string) => void
  onExpandWithAi?: (value: string, format: PromptExpandFormat, guidance: string) => Promise<string>
  saveLabel?: string
  saveAndGenerateLabel?: string
  expandLabel?: string
  placeholder?: string
  rows?: number
  savingAndGenerating?: boolean
  generateDisabled?: boolean
  attachments?: PromptAttachment[]
  onAttachFiles?: (files: File[]) => void | Promise<void>
  onRemoveAttachment?: (id: string) => void
}

function AttachIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="m21.44 11.05-8.49 8.49a5.5 5.5 0 0 1-7.78-7.78l9.2-9.19a3.5 3.5 0 1 1 4.95 4.95l-9.2 9.2a1.5 1.5 0 1 1-2.12-2.13l8.5-8.48" />
    </svg>
  )
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
  attachments = [],
  onAttachFiles,
  onRemoveAttachment,
}: AIPromptEditorModalProps) {
  const [draft, setDraft] = useState(initialValue)
  const [expanding, setExpanding] = useState(false)
  const [expandFormat, setExpandFormat] = useState<PromptExpandFormat>('markdown')
  const [expandGuidance, setExpandGuidance] = useState('')
  const [expandError, setExpandError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [localAttachments, setLocalAttachments] = useState<PromptAttachment[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const effectiveAttachments = attachments ?? localAttachments

  useEffect(() => {
    if (isOpen) {
      setDraft(initialValue)
      setExpandFormat('markdown')
      setExpandGuidance('')
      setExpandError(null)
      setShowPreview(false)
      if (attachments == null) {
        setLocalAttachments([])
      }
    }
  }, [attachments, initialValue, isOpen])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
    >
      <div
        className="h-[78vh] w-[75vw] min-h-[420px] min-w-[320px] max-h-[90vh] max-w-[90vw] overflow-auto resize rounded-lg bg-white shadow-2xl dark:bg-gray-800"
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
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Prompt Editor
            </div>
            <div className="flex items-center gap-2">
              {true ? (
                <>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    <AttachIcon />
                    Add files or images
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.txt,.md,.json,.csv,.yaml,.yml,.pdf"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || [])
                      if (files.length > 0) {
                        if (onAttachFiles) {
                          void onAttachFiles(files)
                        } else {
                          void Promise.all(files.map((file) => createPromptAttachment(file))).then((nextAttachments) => {
                            setLocalAttachments((prev) => {
                              const merged = new Map(prev.map((attachment) => [attachment.id, attachment]))
                              for (const attachment of nextAttachments) merged.set(attachment.id, attachment)
                              return Array.from(merged.values())
                            })
                          })
                        }
                      }
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }}
                    className="hidden"
                  />
                </>
              ) : null}
              <button
                type="button"
                onClick={() => setShowPreview((current) => !current)}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <span>{showPreview ? '▸' : '▾'}</span>
                {showPreview ? 'Hide Preview' : 'Show Preview'}
              </button>
            </div>
          </div>
          {effectiveAttachments.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {effectiveAttachments.map((attachment) => (
                <div key={attachment.id} className="inline-flex max-w-full items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                  <span>{attachment.isImage ? 'Image' : 'File'}: {attachment.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (onRemoveAttachment) {
                        onRemoveAttachment(attachment.id)
                      } else {
                        setLocalAttachments((prev) => prev.filter((entry) => entry.id !== attachment.id))
                      }
                    }}
                    className="text-gray-400 hover:text-red-500"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div className={`grid gap-4 ${showPreview ? 'lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)]' : 'grid-cols-1'}`}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={rows}
              placeholder={placeholder}
              className="w-full resize-y rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 focus:ring-2 focus:ring-purple-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
            {showPreview ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
                <div className="border-b border-gray-200 px-4 py-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  Markdown Preview
                </div>
                <div className="max-h-[480px] overflow-y-auto px-4 py-3 prose prose-sm max-w-none text-gray-900 dark:prose-invert dark:text-gray-100">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {draft || '_Nothing to preview yet._'}
                  </ReactMarkdown>
                </div>
              </div>
            ) : null}
          </div>
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
              <div className="space-y-1">
                <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Improvement Direction
                </label>
                <input
                  type="text"
                  value={expandGuidance}
                  onChange={(e) => setExpandGuidance(e.target.value)}
                  placeholder="Optional: make it shorter, bias toward workflows, keep the tone friendly..."
                  className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
                />
              </div>
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
                    const expanded = await onExpandWithAi(
                      appendPromptAttachmentContext(draft, effectiveAttachments),
                      expandFormat,
                      expandGuidance,
                    )
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
