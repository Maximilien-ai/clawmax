export function DocHubSelectionActionBar({
  selectedCount,
  canMove,
  onMove,
  onDelete,
  onClear,
}: {
  selectedCount: number
  canMove: boolean
  onMove: () => void
  onDelete: () => void
  onClear: () => void
}) {
  if (selectedCount <= 0) return null

  return (
    <div className="mb-2 shrink-0 border border-emerald-300 bg-emerald-50 px-2 py-2 shadow-sm dark:border-emerald-700 dark:bg-emerald-950">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-emerald-800 dark:text-emerald-200">
          {selectedCount} file{selectedCount === 1 ? '' : 's'} selected
        </span>
        <button
          type="button"
          onClick={onClear}
          className="p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
          title="Clear selection"
          aria-label="Clear selected uploads"
        >
          ×
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          onClick={onMove}
          disabled={!canMove}
          className="min-w-0 px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100 disabled:cursor-not-allowed disabled:text-gray-400 dark:text-sky-300 dark:hover:bg-sky-950/40"
          title={canMove ? 'Move selected uploads' : 'Select files from one upload boundary to move them together'}
        >
          Move selected
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="min-w-0 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 dark:text-red-300 dark:hover:bg-red-950/40"
          title="Delete selected uploads"
        >
          Delete selected
        </button>
      </div>
    </div>
  )
}
