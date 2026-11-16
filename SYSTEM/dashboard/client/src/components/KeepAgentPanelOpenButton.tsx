export function KeepAgentPanelOpenButton({ keepOpen, onToggle }: { keepOpen: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-label="Keep open"
      aria-pressed={keepOpen}
      title={keepOpen ? 'Kept open: close with Escape or X. Click to allow outside-click dismissal.' : 'Click outside to dismiss. Click to keep this panel open.'}
      onClick={onToggle}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${keepOpen ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200'}`}
    >
      <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill={keepOpen ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="m16 3 5 5-4 1-4 5v3l-3-3-6 6 6-6-3-3h3l5-4z" />
      </svg>
    </button>
  )
}
