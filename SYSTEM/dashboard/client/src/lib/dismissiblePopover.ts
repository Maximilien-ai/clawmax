import { useCallback, useEffect, useRef, type FocusEvent, type PointerEvent, type RefObject } from 'react'

/** Long enough to cross the gap between a trigger and its popover, or to overshoot and come back. */
const POPOVER_LEAVE_DELAY_MS = 300

/**
 * Light dismissal for a small popover opened from a trigger, where `rootRef` wraps both.
 *
 * It closes on a press outside the root, on Escape (focus returns to the trigger), when focus moves
 * out of the root, and shortly after a mouse or pen pointer leaves the root. Re-entering cancels that
 * delay, so moving between trigger and popover neither closes nor flickers it. Touch pointers have no
 * hover to leave, so a tap outside is their way out. `holdOpen` suspends the pointer-leave close, for
 * example while an action started from the popover is still running and may report an error in it.
 */
export function useDismissiblePopover({ open, onClose, rootRef, triggerRef, holdOpen = false }: {
  open: boolean
  onClose: () => void
  rootRef: RefObject<HTMLElement | null>
  triggerRef: RefObject<HTMLElement | null>
  holdOpen?: boolean
}) {
  const leaveTimer = useRef<number | null>(null)
  const cancelLeave = useCallback(() => {
    if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current)
    leaveTimer.current = null
  }, [])

  useEffect(() => {
    if (!open) return cancelLeave
    const pressOutside = (event: globalThis.PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onClose()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      onClose()
      triggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', pressOutside, true)
    document.addEventListener('keydown', escape)
    return () => {
      cancelLeave()
      document.removeEventListener('pointerdown', pressOutside, true)
      document.removeEventListener('keydown', escape)
    }
  }, [open, onClose, rootRef, triggerRef, cancelLeave])

  useEffect(() => {
    if (holdOpen) cancelLeave()
  }, [holdOpen, cancelLeave])

  return {
    onPointerEnter: cancelLeave,
    onPointerLeave: (event: PointerEvent) => {
      if (!open || holdOpen || event.pointerType === 'touch') return
      cancelLeave()
      leaveTimer.current = window.setTimeout(onClose, POPOVER_LEAVE_DELAY_MS)
    },
    onBlur: (event: FocusEvent) => {
      // A null relatedTarget is a click on something unfocusable; the outside press handles that.
      const next = event.relatedTarget as Node | null
      if (open && next && !event.currentTarget.contains(next)) onClose()
    },
  }
}
