import type { CSSProperties } from 'react'

export type DropdownPlacement = 'top' | 'bottom'

export function getSmartDropdownPlacement(triggerRect: DOMRect, estimatedMenuHeight = 320): DropdownPlacement {
  const spaceBelow = window.innerHeight - triggerRect.bottom
  const spaceAbove = triggerRect.top
  return spaceBelow >= estimatedMenuHeight || spaceBelow >= spaceAbove ? 'bottom' : 'top'
}

export function getViewportSafeDropdownStyle(
  triggerRect: Pick<DOMRect, 'bottom' | 'right' | 'top'>,
  menuWidth: number,
  placement: DropdownPlacement = 'bottom'
): CSSProperties {
  const viewportPadding = 12
  const verticalGap = 6
  const safeWidth = Math.min(menuWidth, Math.max(0, window.innerWidth - viewportPadding * 2))
  const maxLeft = Math.max(viewportPadding, window.innerWidth - safeWidth - viewportPadding)
  const left = Math.min(
    Math.max(viewportPadding, triggerRect.right - safeWidth),
    maxLeft
  )

  if (placement === 'top') {
    return {
      position: 'fixed',
      bottom: Math.max(viewportPadding, window.innerHeight - triggerRect.top + verticalGap),
      left,
      width: safeWidth,
    }
  }

  return {
    position: 'fixed',
    top: Math.min(triggerRect.bottom + verticalGap, window.innerHeight - viewportPadding),
    left,
    width: safeWidth,
  }
}
