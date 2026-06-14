import { resolveCommunicationDocPath } from './communicationMessages'
import { normalizeWorkspaceFileTarget } from './workspaceFiles'

export interface AgentChatDocEntryRef {
  path: string
}

function findScopedDocMatch(scopePrefix: string, target: string, docEntries: AgentChatDocEntryRef[]): string | null {
  const scopedMatches = docEntries.filter((entry) => (
    entry.path.startsWith(scopePrefix)
    && (entry.path === `${scopePrefix}${target}` || entry.path.endsWith(`/${target}`))
  ))
  return scopedMatches.length === 1 ? scopedMatches[0].path : null
}

export function resolveAgentChatDocPath(
  target: string,
  agentId: string,
  docEntries: AgentChatDocEntryRef[]
): string | null {
  if (!target) return null
  const normalized = normalizeWorkspaceFileTarget(target)
  if (normalized.includes('/')) {
    return docEntries.some((entry) => entry.path === normalized) ? normalized : null
  }

  const directAgentPath = `AGENTS/${agentId}/${normalized}`
  const directAgentMatch = docEntries.find((entry) => entry.path === directAgentPath)
  if (directAgentMatch) return directAgentMatch.path
  const scopedAgentMatch = findScopedDocMatch(`AGENTS/${agentId}/`, normalized, docEntries)
  if (scopedAgentMatch) return scopedAgentMatch

  const archivedAgentPath = `AGENTS/archive/${agentId}/${normalized}`
  const archivedAgentMatch = docEntries.find((entry) => entry.path === archivedAgentPath)
  if (archivedAgentMatch) return archivedAgentMatch.path
  const scopedArchivedMatch = findScopedDocMatch(`AGENTS/archive/${agentId}/`, normalized, docEntries)
  if (scopedArchivedMatch) return scopedArchivedMatch

  const fallback = resolveCommunicationDocPath(normalized, docEntries)
  return docEntries.some((entry) => entry.path === fallback) ? fallback : null
}
