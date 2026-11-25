export function documentReference(documentPath: string, reference: string): string | null {
  let href: string
  try { href = decodeURIComponent(reference) } catch { return null }
  if (!href || /^(?:[a-z][\w+.-]*:|\/|\\)/i.test(href) || /[?#\\]/.test(href)) return null
  const parts = documentPath.split('/').slice(0, -1)
  for (const part of href.split('/')) {
    if (part === '..') { if (parts.length <= 1) return null; parts.pop() }
    else if (part && part !== '.') parts.push(part)
  }
  return parts.join('/')
}
