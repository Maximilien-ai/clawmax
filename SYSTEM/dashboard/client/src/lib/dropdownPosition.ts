import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'

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

const VIEWPORT_PADDING = 12
const VERTICAL_GAP = 6

/**
 * Opens below the trigger when the whole menu fits, otherwise on the side with more room, and
 * caps the height at that room so a tall menu scrolls inside the viewport instead of running off it.
 */
export function getViewportBoundedMenuStyle(
  triggerRect: Pick<DOMRect, 'bottom' | 'right' | 'top'>,
  menuWidth: number,
  menuHeight: number
): CSSProperties {
  const viewportHeight = window.innerHeight
  const spaceBelow = viewportHeight - VIEWPORT_PADDING - (triggerRect.bottom + VERTICAL_GAP)
  const spaceAbove = triggerRect.top - VERTICAL_GAP - VIEWPORT_PADDING
  const placement: DropdownPlacement = menuHeight <= spaceBelow || spaceBelow >= spaceAbove ? 'bottom' : 'top'
  const { left, width } = getViewportSafeDropdownStyle(triggerRect, menuWidth, placement)
  // Clamped to the viewport so a trigger scrolled partly out of view never pushes the menu off-screen.
  const clamp = (offset: number) => Math.min(Math.max(VIEWPORT_PADDING, offset), viewportHeight - VIEWPORT_PADDING)
  const offset = clamp(placement === 'bottom' ? triggerRect.bottom + VERTICAL_GAP : viewportHeight - triggerRect.top + VERTICAL_GAP)
  return {
    position: 'fixed',
    [placement === 'bottom' ? 'top' : 'bottom']: offset,
    left,
    width,
    maxHeight: viewportHeight - VIEWPORT_PADDING - offset,
    overflowY: 'auto',
  }
}

const HIDDEN_UNTIL_MEASURED: CSSProperties = { position: 'fixed', top: 0, left: 0, visibility: 'hidden' }

function sameStyle(left: CSSProperties, right: CSSProperties): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]) as Set<keyof CSSProperties>
  return [...keys].every((key) => left[key] === right[key])
}

/**
 * Keeps a fixed-position menu attached to its trigger while it is open. `openKey` is falsy while
 * closed and changes when the same menu opens for another trigger. The menu is measured rather than
 * estimated, and re-measured on scroll, resize and content changes (such as switching sub-views),
 * so it follows the trigger and never needs more room than the viewport has. Escape closes it and
 * returns focus to the trigger.
 */
export function useViewportBoundedMenu(
  openKey: string | boolean | null | undefined,
  triggerRef: RefObject<HTMLElement | null>,
  menuWidth: number,
  onClose: () => void
) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [style, setStyle] = useState<CSSProperties>({ ...HIDDEN_UNTIL_MEASURED, width: menuWidth })

  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!openKey || !menu) return
    const update = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      const next = getViewportBoundedMenuStyle(trigger.getBoundingClientRect(), menuWidth, menu.scrollHeight)
      setStyle((current) => (sameStyle(current, next) ? current : next))
    }
    update()
    const observer = new MutationObserver(update)
    observer.observe(menu, { childList: true, subtree: true, characterData: true })
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      setStyle({ ...HIDDEN_UNTIL_MEASURED, width: menuWidth })
    }
  }, [openKey, menuWidth, triggerRef])

  useEffect(() => {
    if (!openKey) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      onClose()
      triggerRef.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [openKey, onClose, triggerRef])

  return { menuRef, menuStyle: style }
}
