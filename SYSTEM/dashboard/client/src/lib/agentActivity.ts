export interface AgentActivity {
  recentFiles: { name: string; mtime: string; ageMins: number }[]
  todos: string | null
  completed: string | null
  identity: string | null
  skills?: string[]
  liveConfig?: {
    model: string
    backupModel?: string
    workspace: string
    agentDir: string
  }
}

export function normalizeAgentActivityPayload(value: unknown): AgentActivity | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const payload = value as Partial<AgentActivity> & { error?: unknown }
  if (payload.error) return null
  return {
    ...payload,
    recentFiles: Array.isArray(payload.recentFiles) ? payload.recentFiles : [],
    todos: typeof payload.todos === 'string' ? payload.todos : null,
    completed: typeof payload.completed === 'string' ? payload.completed : null,
    identity: typeof payload.identity === 'string' ? payload.identity : null,
    skills: Array.isArray(payload.skills) ? payload.skills : undefined,
  }
}
