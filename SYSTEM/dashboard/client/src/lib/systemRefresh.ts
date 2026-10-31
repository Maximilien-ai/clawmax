export function subscribeSystemRefresh(callback: () => void, target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> = window): () => void {
  const handler = () => callback()
  const events = ['workspace-switched', 'agents-updated']
  for (const event of events) target.addEventListener(event, handler)
  return () => { for (const event of events) target.removeEventListener(event, handler) }
}
