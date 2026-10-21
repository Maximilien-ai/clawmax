import crypto from 'crypto'

const endpoint = 'http://127.0.0.1:43204/v1/agent-skill/execute'
const invocationVersion = 'clawmax.host-agent-skill-invocation/v1alpha1'
const resultVersion = 'clawmax.host-agent-skill/v1alpha1'
const digest = /^sha256:[a-f0-9]{64}$/
const id = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const forbidden = /(?:access[_-]?token|refresh[_-]?token|service[_-]?role|api[_-]?key|authorization|credential|secret)/i

export interface HostAgentSkillScope {
  instanceKey: string; workspaceId: string; workspaceRevisionId: string
  agentId: string; skillName: string; skillDigest: string; actorId: string
  credentialNames: string[]
}

export interface HostAgentSkillResult {
  apiVersion: 'clawmax.host-agent-skill/v1alpha1'
  kind: 'AgentSkillExecutionResult'
  requestId: string
  status: 'completed' | 'blocked' | 'uncertain'
  code?: string
  resultDigest?: string
  output?: Record<string, unknown>
}

function safeBusinessDocument(value: unknown, depth = 0): boolean {
  if (depth > 12 || typeof value === 'number' && !Number.isFinite(value)) return false
  if (value === null) return true
  if (typeof value === 'string') return value.length <= 65536
  if (typeof value === 'boolean' || typeof value === 'number') return true
  if (Array.isArray(value)) return value.length <= 4096 && value.every(item => safeBusinessDocument(item, depth + 1))
  if (typeof value !== 'object') return false
  return Object.entries(value).every(([key, item]) => !forbidden.test(key) && safeBusinessDocument(item, depth + 1))
}

/** Internal server-to-server transport. Only a caller that has already
 * authenticated the Agent and resolved current Template authority may call it.
 * It never logs the key, arguments, or business response. */
export async function executeHostAgentSkillRead(input: {
  scope: HostAgentSkillScope; arguments: string[]; hostKey: string
  fetcher?: typeof fetch; now?: () => Date; signal?: AbortSignal
}): Promise<HostAgentSkillResult> {
  if (!/^[a-f0-9]{64}$/.test(input.hostKey) || !input.scope || !Object.values(input.scope).every(value => Array.isArray(value) || typeof value === 'string')
    || ![input.scope.instanceKey, input.scope.workspaceId, input.scope.workspaceRevisionId, input.scope.agentId,
      input.scope.skillName, input.scope.actorId].every(value => id.test(value))
    || !digest.test(input.scope.skillDigest)
    || !Array.isArray(input.scope.credentialNames) || input.scope.credentialNames.length > 8
    || input.scope.credentialNames.some(name => !/^[A-Z][A-Z0-9_]{1,127}$/.test(name))
    || !Array.isArray(input.arguments) || input.arguments.length < 2 || input.arguments.length > 16
    || input.arguments.some(value => typeof value !== 'string' || !value || value.length > 1024 || /[\r\n\0]/.test(value))) {
    throw new Error('Invalid host Skill invocation')
  }
  const now = input.now?.() ?? new Date()
  const requestId = crypto.randomBytes(32).toString('hex')
  const body = {
    apiVersion: invocationVersion, kind: 'AgentSkillInvocation',
    scope: { apiVersion: 'clawmax.credential-broker-agent-skill/v1alpha1', kind: 'AgentSkillExecutionRequest',
      requestId, ...input.scope, operation: `${input.scope.skillName}.cli.v1`,
      issuedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 30_000).toISOString() },
    arguments: input.arguments,
  }
  if (Buffer.byteLength(JSON.stringify(body)) > 16 * 1024) throw new Error('Host Skill invocation exceeds its bound')
  const response = await (input.fetcher || fetch)(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-ClawMax-Host-Key': input.hostKey },
    body: JSON.stringify(body), signal: input.signal
      ? AbortSignal.any([input.signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000),
  })
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length < 1 || bytes.length > 64 * 1024) throw new Error('Host Skill response is unavailable or oversized')
  let result: any
  try { result = JSON.parse(bytes.toString('utf8')) } catch { throw new Error('Host Skill response is invalid') }
  if (!result || typeof result !== 'object' || Array.isArray(result)
    || result.apiVersion !== resultVersion || result.kind !== 'AgentSkillExecutionResult' || result.requestId !== requestId
    || !['completed', 'blocked', 'uncertain'].includes(result.status)
    || Object.keys(result).some(key => !['apiVersion', 'kind', 'requestId', 'status', 'code', 'resultDigest', 'output'].includes(key))) {
    throw new Error('Host Skill response contract mismatch')
  }
  if (result.status === 'completed') {
    if (!response.ok || typeof result.resultDigest !== 'string' || !digest.test(result.resultDigest)
      || !result.output || typeof result.output !== 'object' || Array.isArray(result.output)
      || typeof result.output.kind !== 'string' || typeof result.output.apiVersion !== 'string'
      || !safeBusinessDocument(result.output) || result.code !== undefined) throw new Error('Host Skill result is invalid')
  } else if (typeof result.code !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(result.code) || result.output !== undefined) {
    throw new Error('Host Skill failure result is invalid')
  }
  return result as HostAgentSkillResult
}
