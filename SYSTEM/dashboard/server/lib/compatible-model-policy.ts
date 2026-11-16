import path from 'path'

function policies(config: any, agentId: string, workspace?: string): any[] {
  const agents = config?.agents
  const candidates = [agents?.defaults]
  const matches = (entry: any) => entry && (!entry.workspace || !workspace || path.resolve(entry.workspace) === path.resolve(workspace))
  const canonical = agents?.entries?.[agentId]
  if (matches(canonical)) candidates.push(canonical)
  if (Array.isArray(agents?.list)) {
    candidates.push(...agents.list.filter((entry: any) => entry?.id === agentId && matches(entry)))
  }
  return candidates.flatMap(entry => Array.isArray(entry?.modelPolicy?.allow) ? [entry.modelPolicy] : [])
}

const runtimeRef = (ref: unknown): unknown => typeof ref === 'string' && ref.startsWith('openai-compatible/')
  ? `lmstudio/${ref.slice('openai-compatible/'.length)}`
  : ref

export function needsCompatibleModelPolicyNormalization(config: unknown, agentId: string, workspace?: string): boolean {
  return policies(config, agentId, workspace).some(policy => policy.allow.some((ref: unknown) => runtimeRef(ref) !== ref))
}

// Model execution uses lmstudio/<id>. Replace equivalent logical references instead of
// appending grants, so policy removal/revocation cannot leave a second permission behind.
// Exact models and trailing prefix wildcards retain their original scope; an explicit
// per-agent policy remains an override and an absent/empty policy stays unchanged.
export function normalizeCompatibleModelPolicies(config: unknown, agentId: string, workspace?: string): void {
  for (const policy of policies(config, agentId, workspace)) policy.allow = policy.allow.map(runtimeRef)
}
