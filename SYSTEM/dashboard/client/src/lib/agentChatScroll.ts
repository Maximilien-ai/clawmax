/** How far from the end, in px, still counts as reading the latest message. */
export const CHAT_FOLLOW_THRESHOLD_PX = 80

/**
 * Whether the conversation should keep following new content after a scroll event.
 *
 * Moving up stops following at once, even a few pixels from the end: while a reply streams, the next
 * delta lands within ~80 ms and would otherwise snap the reader back before a smooth wheel scroll got
 * anywhere. Resting at the very end is not that, though -- content shrinking under a reader at the
 * end clamps scrollTop downwards. Coming back to near the end follows again; anything else (a
 * programmatic scroll toward the end, a smooth scroll in flight) keeps the current state.
 */
export function nextChatFollowState(following: boolean, previousScrollTop: number, metrics: Pick<HTMLElement, 'scrollTop' | 'scrollHeight' | 'clientHeight'>): boolean {
  const distance = metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight
  if (distance <= 2) return true
  if (metrics.scrollTop < previousScrollTop) return false
  if (distance <= CHAT_FOLLOW_THRESHOLD_PX) return true
  return following
}
