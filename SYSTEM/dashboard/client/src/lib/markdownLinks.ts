const SAFE_PROTOCOL = /^(https?|ircs?|mailto|xmpp)$/i

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
