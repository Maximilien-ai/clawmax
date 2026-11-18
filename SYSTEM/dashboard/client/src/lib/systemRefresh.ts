export function subscribeSystemRefresh(callback: () => void, target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> = window): () => void {
  const handler = () => callback()
  target.addEventListener('workspace-switched', handler)
  target.addEventListener('agents-updated', handler)
  return () => {
    target.removeEventListener('workspace-switched', handler)
    target.removeEventListener('agents-updated', handler)
  }
}
