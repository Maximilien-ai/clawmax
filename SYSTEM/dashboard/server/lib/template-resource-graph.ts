import { PortableTemplate } from './portable-template'
import { sha256 } from './portable-template'
import { PortableTemplateError } from './portable-template-zip'
import { TemplateResourceOwnership } from './template-revisions'

export interface CompiledTemplateAgent {
  id: string
  artifactId: string
  digest: string
  name: string
  description: string
  instructions: string
  tags: string[]
  requestedModel?: string
  requestedSkills: string[]
  admission: 'pending-authority'
}
export interface CompiledTemplateGroup {
  id: string
  artifactId: string
  digest: string
  name: string
  description: string
  objective: string
  state: 'stopped'
  entryMemberIds: string[]
  members: Array<{ id: string; agentId: string; role: string; sendTo: string[] }>
  limits: { maxTurns: number; maxMessages: number; maxMessageBytes: number; retentionSeconds: number }
}
export interface CompiledTemplateWorkflow {
  id: string
  artifactId: string
  digest: string
  name: string
  description: string
  objective: string
  enabled: false
  schedule: { type: 'manual' | 'once' | 'interval' | 'cron'; intervalSeconds?: number; cron?: string; timeZone?: string }
  execution: { mode: 'automated' | 'managed'; ownerStepId?: string }
  runPolicy: { type: 'once' | 'recurring' | 'conditional'; maxRuns: number; dependsOn: string[] }
  steps: Array<{ id: string; targetKind: 'agent' | 'group'; targetId: string; objective: string }>
  edges: Array<{ from: string; to: string; condition: 'success' | 'failure'; handoff: 'structured-output' | 'evidence-reference' }>
  limits: { maxParallel: number; maxRunSeconds: number; maxOutputBytes: number; retentionSeconds: number }
}
export interface CompiledTemplateResourceGraph {
  resources: TemplateResourceOwnership
  agents: CompiledTemplateAgent[]
  groups: CompiledTemplateGroup[]
  workflows: CompiledTemplateWorkflow[]
}

/** Pure lowering phase for an already validated portable bundle.
 * Resolves portable digest references to deterministic workspace resource IDs.
 * It does not write files, register gateway agents, resolve credentials, or
 * authorize execution. Model/Skill requests remain untrusted requests until
 * the server-owned authority admission phase accepts them.
 */
export function compileTemplateResourceGraph(bundle: PortableTemplate, resourcePrefix: string): CompiledTemplateResourceGraph {
  if (!/^tr-[a-f0-9]{16}$/.test(resourcePrefix)) throw new PortableTemplateError('invalid_plan', 'Invalid revision resource namespace')
  const resources: TemplateResourceOwnership = { agents: {}, communities: {}, groups: {}, workflows: {} }
  const targets = new Map<string, string>()
  const identities = new Set<string>()
  for (const artifact of bundle.artifacts) {
    const key = `${artifact.kind}:${artifact.id}`
    const targetKey = `${artifact.kind}:${artifact.digest}`
    // A digest-only graph reference cannot distinguish two copies of the same
    // artifact. Reject ambiguity rather than select a member by array order.
    if (identities.has(key) || targets.has(targetKey)) throw new PortableTemplateError('ambiguous_template_graph', 'Template artifact identity or digest is ambiguous')
    identities.add(key)
    const id = `${resourcePrefix}-${artifact.kind}-${sha256(key).slice(0, 12)}`
    resources[`${artifact.kind}s`][artifact.id] = id
    targets.set(targetKey, id)
  }
  const resolve = (kind: string, digest: string): string => {
    const target = targets.get(`${kind}:${digest}`)
    if (!target) throw new PortableTemplateError('invalid_template_graph', 'Template graph target is missing')
    return target
  }
  const graph: CompiledTemplateResourceGraph = { resources, agents: [], groups: [], workflows: [] }
  for (const artifact of bundle.artifacts) {
    // Never retain references to caller-owned arrays or nested graph objects.
    const definition = structuredClone(artifact.definition)
    const base = { id: resources[`${artifact.kind}s`][artifact.id], artifactId: artifact.id, digest: artifact.digest, name: definition.name, description: definition.description }
    if (artifact.kind === 'agent') {
      graph.agents.push({ ...base, instructions: definition.instructions, tags: definition.tags || [], ...(definition.model ? { requestedModel: definition.model } : {}), requestedSkills: definition.skills, admission: 'pending-authority' })
    } else if (artifact.kind === 'group') {
      graph.groups.push({
        ...base, objective: definition.objective, state: 'stopped',
        entryMemberIds: definition.entryMemberIds,
        members: definition.members.map((member: any) => ({ id: member.id, agentId: resolve('agent', member.agentDigest), role: member.role, sendTo: member.sendTo })),
        limits: definition.limits,
      })
    } else {
      graph.workflows.push({
        ...base, objective: definition.objective, enabled: false,
        schedule: definition.schedule, execution: definition.execution,
        runPolicy: { ...definition.runPolicy, dependsOn: definition.runPolicy.dependsOn.map((digest: string) => resolve('workflow', digest)) },
        steps: definition.steps.map((step: any) => ({ id: step.id, targetKind: step.targetKind, targetId: resolve(step.targetKind, step.targetDigest), objective: step.objective })),
        edges: definition.edges, limits: definition.limits,
      })
    }
  }
  return graph
}
