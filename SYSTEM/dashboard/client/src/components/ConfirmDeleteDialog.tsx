import React, { useState, useEffect } from 'react'

interface ConfirmDeleteDialogProps {
  isOpen: boolean
  itemName: string
  itemType: string
  warningMessage?: string
  consequences?: string[]
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDeleteDialog({
  isOpen,
  itemName,
  itemType,
  warningMessage,
  consequences,
  onConfirm,
  onCancel
}: ConfirmDeleteDialogProps) {
  const [confirmText, setConfirmText] = useState('')

  useEffect(() => {
    if (isOpen) {
      setConfirmText('')
    }
  }, [isOpen])

  if (!isOpen) return null

  const isConfirmed = confirmText === itemName

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-2 dark:text-gray-100">Delete {itemType}</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Are you sure you want to delete <span className="font-semibold">{itemName}</span>?
        </p>

        {warningMessage && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
            <p className="text-sm text-yellow-800">{warningMessage}</p>
          </div>
        )}

        {consequences && consequences.length > 0 && (
          <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded dark:border-gray-700 dark:bg-gray-900">
            <p className="text-xs font-semibold text-gray-700 mb-2 dark:text-gray-300">This will affect:</p>
            <div className="text-xs text-gray-600 dark:text-gray-400 space-y-0.5 font-mono">
              {consequences.map((consequence, i) => (
                <div key={i}>{consequence}</div>
              ))}
            </div>
          </div>
        )}

        <div className="mb-6">
          <label htmlFor="confirm-name" className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
            Type <span className="font-mono font-semibold">{itemName}</span> to confirm
          </label>
          <input
            id="confirm-name"
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={itemName}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600"
            autoFocus
          />
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors dark:text-gray-100 dark:text-gray-300"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (isConfirmed) {
                onConfirm()
              }
            }}
            disabled={!isConfirmed}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Delete {itemType}
          </button>
        </div>
      </div>
    </div>
  )
}
