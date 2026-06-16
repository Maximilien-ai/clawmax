import {
  normalizeWorkspaceFileTarget,
  resolveWorkspaceDocPath,
  WorkspaceDocEntryRef,
} from './workspaceFiles'

export function resolveNavigableWorkspaceDocPath(
  target: string,
  docEntries: WorkspaceDocEntryRef[] | null | undefined
): string | null {
  const normalized = normalizeWorkspaceFileTarget(target)
  if (!normalized) return null

  const entries = docEntries || []
  if (entries.length === 0) {
    return normalized.includes('/') ? normalized : null
  }

  return resolveWorkspaceDocPath(normalized, entries)
}
