export function addVisitedPage<T extends string>(visitedPages: Set<T>, nextPage: T): Set<T> {
  if (visitedPages.has(nextPage)) return visitedPages
  const next = new Set(visitedPages)
  next.add(nextPage)
  return next
}
