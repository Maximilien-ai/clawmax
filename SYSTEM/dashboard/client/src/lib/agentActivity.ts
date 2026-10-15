export interface AgentActivity {
  recentFiles: { name: string; mtime: string; ageMins: number }[]
  todos: string | null
  completed: string | null
  identity: string | null
  skills: string[]
  liveConfig?: {
    model: string
    backupModel?: string
    workspace: string
    agentDir: string
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

export function normalizeAgentActivity(payload: unknown): AgentActivity | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null

  const candidate = payload as Record<string, unknown>
  if (typeof candidate.error === 'string') return null

  const recentFiles = Array.isArray(candidate.recentFiles)
    ? candidate.recentFiles.flatMap((entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
        const file = entry as Record<string, unknown>
        if (typeof file.name !== 'string' || typeof file.mtime !== 'string' || typeof file.ageMins !== 'number' || !Number.isFinite(file.ageMins)) return []
        return [{ name: file.name, mtime: file.mtime, ageMins: file.ageMins }]
      })
    : []

  const skills = Array.isArray(candidate.skills)
    ? candidate.skills.filter((skill): skill is string => typeof skill === 'string')
    : []

  let liveConfig: AgentActivity['liveConfig']
  if (candidate.liveConfig && typeof candidate.liveConfig === 'object' && !Array.isArray(candidate.liveConfig)) {
    const config = candidate.liveConfig as Record<string, unknown>
    if (typeof config.model === 'string' && typeof config.workspace === 'string' && typeof config.agentDir === 'string') {
      liveConfig = {
        model: config.model,
        workspace: config.workspace,
        agentDir: config.agentDir,
        ...(optionalString(config.backupModel) ? { backupModel: optionalString(config.backupModel) } : {}),
      }
    }
  }

  return {
    recentFiles,
    todos: nullableString(candidate.todos),
    completed: nullableString(candidate.completed),
    identity: nullableString(candidate.identity),
    skills,
    liveConfig,
  }
}
