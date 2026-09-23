/** Check explicit OpenClaw 2 policy without widening operator-owned permissions.
 * Legacy defaults.models remains a catalog handled by the existing writer.
 */
export function assertAgentModelPolicy(config: any, agent: any, models: Array<string | undefined>): void {
  const own = (value: any) => value && Object.prototype.hasOwnProperty.call(value, 'allow')
  const agentPolicy = agent?.modelPolicy
  const defaultPolicy = config?.agents?.defaults?.modelPolicy
  const policy = own(agentPolicy) ? agentPolicy : own(defaultPolicy) ? defaultPolicy : undefined
  if (!policy) return
  const configPath = own(agentPolicy) ? 'agent.modelPolicy.allow' : 'agents.defaults.modelPolicy.allow'
  const deny = (model: string): never => {
    throw new Error(`Model "${model}" is blocked by ${configPath}. Choose an allowed model or ask the instance administrator to review this policy. No model policy was changed.`)
  }
  if (!Array.isArray(policy.allow) || policy.allow.some((ref: unknown) => typeof ref !== 'string')) deny(models.find(Boolean) || 'selected model')
  if (!policy.allow.length) return
  const runtimeRef = (ref: string) => ref.trim().replace(/^openai-compatible\//, 'lmstudio/')
  const catalog = { ...config?.agents?.defaults?.models, ...agent?.models }
  const refs = policy.allow.flatMap((ref: string) => {
    const aliases = Object.entries(catalog).filter(([, value]: [string, any]) => value?.alias?.toLowerCase() === ref.trim().toLowerCase()).map(([key]) => runtimeRef(key))
    return [runtimeRef(ref), ...aliases]
  })
  for (const model of models) {
    if (!model) continue
    const selected = runtimeRef(model)
    if (!refs.some((ref: string) => ref === selected || (ref.endsWith('/*') && selected.startsWith(ref.slice(0, -1))))) deny(model)
  }
}
