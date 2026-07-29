import React, { ReactNode } from 'react'

interface MobileSafeDialogProps {
  ariaLabelledBy: string
  header: ReactNode
  children: ReactNode
  footer: ReactNode
  onClose?: () => void
  panelClassName?: string
  zIndexClassName?: string
}

export function MobileSafeDialog({
  ariaLabelledBy,
  header,
  children,
  footer,
  onClose,
  panelClassName = 'max-w-xl',
  zIndexClassName = 'z-[70]',
}: MobileSafeDialogProps) {
  return (
    <div
      className={`fixed inset-0 ${zIndexClassName} flex items-end justify-center bg-black/40 p-2 sm:items-center sm:p-4`}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
        className={`flex max-h-[calc(100dvh-1rem)] w-full flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800 sm:max-h-[calc(100dvh-2rem)] ${panelClassName}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 border-b border-gray-200 px-4 py-3 dark:border-gray-700 sm:px-6 sm:py-4">
          {header}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
          {children}
        </div>
        <div className="shrink-0 border-t border-gray-200 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-gray-700 sm:px-6 sm:py-4">
          {footer}
        </div>
      </div>
    </div>
  )
}
