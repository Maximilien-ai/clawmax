const SAFE_PROTOCOL = /^(https?|ircs?|mailto|xmpp)$/i
const RUNTIME_ONLY_FILENAMES = new Set([
  'auth-profiles.json',
])

export function transformWorkspaceMarkdownUrl(value: string): string {
  if (value.startsWith('workspace-file:')) return value

  const colon = value.indexOf(':')
  const questionMark = value.indexOf('?')
  const numberSign = value.indexOf('#')
  const slash = value.indexOf('/')

  if (
    colon === -1 ||
    (slash !== -1 && colon > slash) ||
    (questionMark !== -1 && colon > questionMark) ||
    (numberSign !== -1 && colon > numberSign) ||
    SAFE_PROTOCOL.test(value.slice(0, colon))
  ) {
    return value
  }

  return ''
}

export function isOpenableWorkspaceFileMention(value: string): boolean {
  const normalized = value.trim().replace(/^workspace-file:/, '')
  if (!normalized) return false
  const filename = normalized.split('/').pop()?.toLowerCase() || ''
  if (RUNTIME_ONLY_FILENAMES.has(filename)) return false
  if (normalized.includes('/.openclaw/') || normalized.startsWith('.openclaw/')) return false
  return true
}
