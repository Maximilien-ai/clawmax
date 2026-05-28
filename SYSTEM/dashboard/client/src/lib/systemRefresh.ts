export function subscribeSystemRefresh(callback: () => void, target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> = window): () => void {
  const handler = () => callback()
  target.addEventListener('workspace-switched', handler)
  return () => target.removeEventListener('workspace-switched', handler)
}
