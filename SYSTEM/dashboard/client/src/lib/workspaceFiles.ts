import { isOpenableWorkspaceFileMention } from './markdownLinks'

const WORKSPACE_ROOT_PREFIX = '(?:AGENTS|GROUPS|COMMUNITIES|WORKFLOWS|SYSTEM|ORG)'
const FILE_EXTENSION_PATTERN = '(?:md|txt|json|csv|pdf|html|yml|yaml|png|jpe?g|gif|webp|svg)'

export const WORKSPACE_FILE_REGEX = new RegExp(
  `\\b${WORKSPACE_ROOT_PREFIX}\\/[A-Za-z0-9_./-]+\\.${FILE_EXTENSION_PATTERN}\\b|\\b[A-Za-z0-9][A-Za-z0-9._-]*\\.${FILE_EXTENSION_PATTERN}\\b`,
  'g'
)

export const ABSOLUTE_WORKSPACE_FILE_REGEX = new RegExp(
  `\\/(?:Users|workspace|app)\\/[^\\s"'<>]+?\\/(${WORKSPACE_ROOT_PREFIX}\\/[A-Za-z0-9_./-]+\\.${FILE_EXTENSION_PATTERN})`,
  'g'
)

export interface WorkspaceDocEntryRef {
  path: string
}

export function parseWorkspaceDocEntriesResponse(data: any): WorkspaceDocEntryRef[] {
  const candidates = Array.isArray(data?.docs)
    ? data.docs
    : Array.isArray(data?.files)
      ? data.files
      : []

  return candidates
    .map((file: any) => ({ path: String(file?.path || file || '').trim() }))
    .filter((entry: WorkspaceDocEntryRef) => !!entry.path)
}

export function normalizeWorkspaceFileTarget(target: string): string {
  const trimmed = target.trim().replace(/^workspace-file:/, '')
  const withoutSuffix = trimmed.split(/[?#]/, 1)[0] || ''
  let decoded = withoutSuffix
  try {
    decoded = decodeURIComponent(withoutSuffix)
  } catch {
    decoded = withoutSuffix
  }
  const absoluteMatch = decoded.match(new RegExp(`(${WORKSPACE_ROOT_PREFIX}\\/[A-Za-z0-9_./ -]+\\.${FILE_EXTENSION_PATTERN})`))
  if (absoluteMatch) return absoluteMatch[1]
  return decoded
}

function isHiddenHelperPathContext(content: string, matchIndex: number): boolean {
  const prefix = content.slice(Math.max(0, matchIndex - 64), matchIndex)
  return /(?:^|[\\/\s(])\.[^/\\\s"'<>]+[\\/]$/.test(prefix)
}

export function extractWorkspaceFileMentions(content: string): string[] {
  const matches: string[] = []

  for (const match of content.matchAll(ABSOLUTE_WORKSPACE_FILE_REGEX)) {
    matches.push(match[1])
  }

  for (const match of content.matchAll(WORKSPACE_FILE_REGEX)) {
    if (typeof match.index === 'number' && isHiddenHelperPathContext(content, match.index)) {
      continue
    }
    matches.push(match[0])
  }

  return Array.from(
    new Set(
      matches
        .map((target) => normalizeWorkspaceFileTarget(target))
        .filter((target) => isOpenableWorkspaceFileMention(target))
    )
  )
}

export function linkifyWorkspaceFiles(content: string): string {
  return content.replace(
    /(^|[\s(])((?:AGENTS|GROUPS|COMMUNITIES|WORKFLOWS|SYSTEM|ORG)\/[A-Za-z0-9_./-]+\.(?:md|txt|json|csv|pdf|html|yml|yaml|png|jpe?g|gif|webp|svg)|[A-Za-z0-9][A-Za-z0-9._-]*\.(?:md|txt|json|csv|pdf|html|yml|yaml|png|jpe?g|gif|webp|svg))(?!\])/gm,
    (_match, prefix, target) => {
      const normalized = normalizeWorkspaceFileTarget(target)
      if (!isOpenableWorkspaceFileMention(normalized)) return `${prefix}${target}`
      if (!normalized.includes('/')) {
        return `${prefix}[${normalized}](workspace-file:${normalized})`
      }
      if (/^(AGENTS|GROUPS|COMMUNITIES|WORKFLOWS|SYSTEM|ORG)\//.test(normalized)) {
        return `${prefix}[${normalized}](workspace-file:${normalized})`
      }
      return `${prefix}${target}`
    }
  )
}

export function resolveWorkspaceDocPath(
  target: string,
  docEntries: WorkspaceDocEntryRef[]
): string | null {
  const normalized = normalizeWorkspaceFileTarget(target)
  if (!normalized) return null

  if (normalized.includes('/')) {
    return docEntries.some((entry) => entry.path === normalized) ? normalized : null
  }

  const exact = docEntries.find((entry) => entry.path === normalized)
  if (exact) return exact.path

  const matches = docEntries.filter((entry) => (
    entry.path.endsWith(`/${normalized}`) || entry.path === normalized
  ))
  return matches.length === 1 ? matches[0].path : null
}
