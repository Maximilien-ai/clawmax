import crypto from 'crypto'
import Ajv from 'ajv'
import { readPortableZip, requirePortable } from './portable-template-zip'

const key = { type: 'string', pattern: '^[a-z][a-z0-9-]{0,63}$' }
const id = { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' }
const hash = { type: 'string', pattern: '^[a-f0-9]{64}$' }
const digest = { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' }
const version = { type: 'string', pattern: '^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$' }
const text = (max: number, min = 0) => ({ type: 'string', minLength: min, maxLength: max })
const integer = (min: number, max: number) => ({ type: 'integer', minimum: min, maximum: max })
const choices = (...values: string[]) => ({ type: 'string', enum: values })
const array = (items: object, max: number, min = 0) => ({ type: 'array', items, minItems: min, maxItems: max, uniqueItems: true })
const object = (properties: Record<string, object>, optional: string[] = []) => ({ type: 'object', properties, required: Object.keys(properties).filter(k => !optional.includes(k)), additionalProperties: false })
const date = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$' }
const tags = array({ type: 'string', pattern: '^[a-z0-9][a-z0-9._-]{0,62}$' }, 32)
const source = (resource: string) => object({ instanceId: id, workspaceId: id, [resource]: id, revision: id })
const file = object({ path: text(255, 1), sizeBytes: integer(0, 32 * 1024 * 1024), sha256: hash })
const manifestSchema = object({
  apiVersion: choices('clawmax.portable-template/v1alpha1'), kind: choices('PortableTemplate'),
  key, name: text(128, 1), version, description: text(4096), createdAt: date, source: source('templateId'),
  secretRequirements: array(object({ name: { type: 'string', pattern: '^[A-Z][A-Z0-9_]{1,127}$' }, label: text(128, 1), kind: choices('api-key', 'token', 'url', 'text'), required: { type: 'boolean' }, sensitive: { type: 'boolean' }, help: text(1024) }, ['help']), 128),
  artifacts: array(object({ id: key, kind: choices('agent', 'group', 'workflow'), path: text(255, 1), sizeBytes: integer(1, 64 * 1024 * 1024), sha256: hash }), 128, 1),
}, ['source'])
const agentManifestSchema = object({ apiVersion: choices('clawmax.portable-agent/v1alpha2'), kind: choices('PortableAgent'), agent: object({ id, name: text(128, 1), description: text(4096), tags }, ['tags']), createdAt: date, files: array(file, 2047, 1) })
const agentSchema = object({ apiVersion: choices('clawmax.portable-agent-definition/v1alpha2'), kind: choices('Agent'), name: text(128, 1), description: text(4096), instructions: text(1024 * 1024, 1), model: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$' }, skills: array({ type: 'string', pattern: '^[a-z0-9][a-z0-9._-]{0,62}$' }, 128), tags }, ['model', 'tags'])
const groupSchema = object({ apiVersion: choices('clawmax.portable-group/v1alpha2'), kind: choices('PortableGroup'), key, name: text(128, 1), description: text(4096), objective: text(16384, 1), source: source('groupId'), entryMemberIds: array(key, 32, 1), members: array(object({ id: key, agentDigest: digest, role: text(256, 1), sendTo: array(key, 32) }), 32, 2), limits: object({ maxTurns: integer(1, 100), maxMessages: integer(1, 1000), maxMessageBytes: integer(256, 65536), retentionSeconds: integer(60, 604800) }) }, ['source'])
const workflowSchema = object({ apiVersion: choices('clawmax.portable-workflow/v1alpha2'), kind: choices('PortableWorkflow'), key, name: text(128, 1), description: text(4096), objective: text(16384, 1), source: source('workflowId'), template: object({ templateId: id, version, digest }), schedule: object({ type: choices('manual', 'once', 'interval', 'cron'), intervalSeconds: integer(60, 2592000), cron: text(256, 1), timeZone: text(128, 1) }, ['intervalSeconds', 'cron', 'timeZone']), execution: object({ mode: choices('automated', 'managed'), ownerStepId: key }, ['ownerStepId']), runPolicy: object({ type: choices('once', 'recurring', 'conditional'), maxRuns: integer(0, 100000), dependsOn: array(digest, 64) }), steps: array(object({ id: key, targetKind: choices('agent', 'group'), targetDigest: digest, objective: text(16384, 1) }), 64, 1), edges: array(object({ from: key, to: key, condition: choices('success', 'failure'), handoff: choices('structured-output', 'evidence-reference') }), 4096), limits: object({ maxParallel: integer(1, 8), maxRunSeconds: integer(1, 86400), maxOutputBytes: integer(256, 16777216), retentionSeconds: integer(60, 604800) }) }, ['source', 'template'])

const ajv = new Ajv({ allErrors: false })
const schemas = { manifest: manifestSchema, agentManifest: agentManifestSchema, agent: agentSchema, group: groupSchema, workflow: workflowSchema }
const validators = Object.fromEntries(Object.entries(schemas).map(([name, schema]) => [name, ajv.compile(schema)]))
export const sha256 = (bytes: Buffer | string) => crypto.createHash('sha256').update(bytes).digest('hex')

function parse(bytes: Buffer | undefined, schema: keyof typeof schemas): any {
  requirePortable(bytes && bytes.length <= 1024 * 1024, 'Missing or oversized manifest/definition')
  let data: any
  try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) } catch { requirePortable(false, 'Invalid UTF-8 JSON') }
  requirePortable(validators[schema](data), `Unsupported or invalid ${schema} fields`)
  const record = data as Record<string, any>
  for (const field of ['name', 'objective', 'instructions']) if (field in record) requirePortable(record[field].trim(), `${field} must not be blank`)
  if (record.createdAt) {
    const [year, month, day] = record.createdAt.slice(0, 10).split('-').map(Number)
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    requirePortable(month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1] && Number.isFinite(Date.parse(record.createdAt)), 'Invalid creation time')
  }
  return data
}
function ordered(values: string[]) { requirePortable(values.every((value, i) => i === 0 || values[i - 1] < value), 'Values must be unique and canonically ordered') }
function verified(files: Map<string, Buffer>, entry: any): Buffer {
  const content = files.get(entry.path)
  requirePortable(content && content.length === entry.sizeBytes && sha256(content) === entry.sha256, 'Artifact size or digest mismatch')
  return content
}
// The CLI content digest uses schema field order (Go struct JSON), not input
// property order. Canonicalize recursively from the public schema before hashing.
function canonical(value: any, schema: any): any {
  if (schema.type === 'array') return value.map((item: any) => canonical(item, schema.items))
  if (schema.type !== 'object') return value
  return Object.fromEntries(Object.entries(schema.properties).filter(([name]) => value[name] !== undefined).map(([name, child]) => [name, canonical(value[name], child)]))
}
function contentDigest(value: any, schema: any): string {
  const json = JSON.stringify(canonical(value, schema)).replace(/[<>&\u2028\u2029]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`)
  return `sha256:${sha256(json)}`
}
function acyclic(nodes: string[], edges: Array<[string, string]>) {
  const adjacency = new Map(nodes.map(node => [node, [] as string[]]))
  for (const [from, to] of edges) {
    requirePortable(adjacency.has(from) && adjacency.has(to) && from !== to, 'Graph references an unknown or self target')
    adjacency.get(from)!.push(to)
  }
  const visiting = new Set<string>(), visited = new Set<string>()
  function visit(node: string) {
    requirePortable(!visiting.has(node), 'Graph contains a cycle')
    if (visited.has(node)) return
    visiting.add(node)
    for (const next of adjacency.get(node)!) visit(next)
    visiting.delete(node); visited.add(node)
  }
  nodes.forEach(visit)
}
export interface PortableArtifact { id: string; kind: 'agent' | 'group' | 'workflow'; digest: string; definition: any; files?: Map<string, Buffer> }
export interface PortableTemplate { manifest: any; bundleSha256: string; artifacts: PortableArtifact[] }

export async function validatePortableTemplate(bytes: Buffer): Promise<PortableTemplate> {
  const files = await readPortableZip(bytes)
  const manifest = parse(files.get('manifest.json'), 'manifest')
  requirePortable(Number.isFinite(Date.parse(manifest.createdAt)), 'Invalid creation time')
  ordered(manifest.secretRequirements.map((item: any) => item.name))
  requirePortable(manifest.secretRequirements.every((item: any) => item.label.trim()), 'Secret requirement labels must not be blank')
  ordered(manifest.artifacts.map((item: any) => `${item.kind}\0${item.id}`))
  requirePortable(files.size === manifest.artifacts.length + 1 && manifest.artifacts.some((item: any) => item.kind === 'agent'), 'Template must declare all files and at least one agent')
  const artifacts: PortableArtifact[] = []
  let expandedBytes = [...files.values()].reduce((total, file) => total + file.length, 0)
  for (const entry of manifest.artifacts) {
    requirePortable(entry.path === `${entry.kind}s/${entry.id}.${entry.kind === 'agent' ? 'zip' : 'json'}`, 'Artifact path does not match identity')
    const content = verified(files, entry)
    if (entry.kind === 'agent') {
      const agentFiles = await readPortableZip(content, true)
      expandedBytes += [...agentFiles.values()].reduce((total, file) => total + file.length, 0)
      requirePortable(expandedBytes <= 256 * 1024 * 1024, 'Nested Template expansion limit exceeded')
      const identity = parse(agentFiles.get('manifest.json'), 'agentManifest')
      requirePortable(identity.agent.name.trim(), 'Agent name must not be blank')
      requirePortable(Number.isFinite(Date.parse(identity.createdAt)) && agentFiles.size === identity.files.length + 1, 'Invalid agent file inventory')
      const paths = new Set<string>()
      for (const file of identity.files) {
        requirePortable(!paths.has(file.path) && (['content/agent.json', 'content/instructions.md'].includes(file.path) || file.path.startsWith('content/skills/')), 'Unexpected agent file')
        requirePortable(!file.path.split('/').some((part: string) => /^(?:\.env|\.ssh|cookies(?:\.sqlite)?|auth\.db)$/i.test(part) || /(?:^|[-_.])(?:secrets?|credentials?|tokens?)(?:[-_.]|$)/i.test(part)), 'Private state is not portable content')
        paths.add(file.path); verified(agentFiles, file)
      }
      const definition = parse(agentFiles.get('content/agent.json'), 'agent')
      requirePortable(paths.has('content/agent.json') && definition.name === identity.agent.name && definition.description === identity.agent.description && JSON.stringify(definition.tags || []) === JSON.stringify(identity.agent.tags || []), 'Agent identity mismatch')
      requirePortable(definition.instructions.trim() && (!definition.model || (!definition.model.includes('..') && !/^[A-Za-z]:\//.test(definition.model))), 'Invalid agent instructions or model')
      artifacts.push({ id: entry.id, kind: 'agent', digest: `sha256:${sha256(content)}`, definition, files: agentFiles })
    } else {
      const definition = parse(content, entry.kind)
      if (entry.kind === 'group') {
        ordered(definition.members.map((member: any) => member.id)); ordered(definition.entryMemberIds)
        const ids = new Set(definition.members.map((member: any) => member.id))
        requirePortable(definition.entryMemberIds.every((member: string) => ids.has(member)), 'Unknown Group entry member')
        for (const member of definition.members) { ordered(member.sendTo); requirePortable(member.sendTo.every((target: string) => target !== member.id && ids.has(target)), 'Unknown Group recipient') }
        requirePortable(definition.members.every((member: any) => member.role.trim()), 'Group member roles must not be blank')
      } else {
        ordered(definition.steps.map((step: any) => step.id)); ordered(definition.runPolicy.dependsOn)
        requirePortable(definition.steps.every((step: any) => step.objective.trim()), 'Workflow step objectives must not be blank')
        ordered(definition.edges.map((edge: any) => `${edge.from}\0${edge.to}\0${edge.condition}`))
        requirePortable(new Set(definition.edges.map((edge: any) => `${edge.from}\0${edge.to}`)).size === definition.edges.length, 'Duplicate Workflow transition')
        acyclic(definition.steps.map((step: any) => step.id), definition.edges.map((edge: any) => [edge.from, edge.to]))
        requirePortable(definition.execution.mode === 'managed' ? definition.steps.some((step: any) => step.id === definition.execution.ownerStepId) : !definition.execution.ownerStepId, 'Invalid Workflow owner')
        requirePortable((definition.runPolicy.type !== 'once' || definition.runPolicy.maxRuns === 1) && (definition.runPolicy.type !== 'conditional' || definition.runPolicy.dependsOn.length > 0), 'Invalid Workflow run policy')
        const schedule = definition.schedule
        requirePortable(schedule.type === 'interval' ? schedule.intervalSeconds && !schedule.cron && !schedule.timeZone : schedule.type === 'cron' ? !schedule.intervalSeconds && schedule.cron && schedule.timeZone : !schedule.intervalSeconds && !schedule.cron && !schedule.timeZone, 'Invalid Workflow schedule fields')
        if (schedule.type === 'cron') {
          const cron = require('node-cron')
          requirePortable(schedule.cron.trim().split(/\s+/).length === 5 && cron.validate(schedule.cron), 'Invalid cron schedule')
          try { new Intl.DateTimeFormat('en', { timeZone: schedule.timeZone }) } catch { requirePortable(false, 'Invalid schedule timezone') }
        }
      }
      artifacts.push({ id: entry.id, kind: entry.kind, definition, digest: contentDigest(definition, entry.kind === 'group' ? groupSchema : workflowSchema) })
    }
  }
  const known = new Set(artifacts.map(item => `${item.kind}:${item.digest}`))
  for (const artifact of artifacts) {
    if (artifact.kind === 'group') for (const member of artifact.definition.members) requirePortable(known.has(`agent:${member.agentDigest}`), 'Group refers outside the Template')
    if (artifact.kind === 'workflow') for (const step of artifact.definition.steps) requirePortable(known.has(`${step.targetKind}:${step.targetDigest}`), 'Workflow refers outside the Template')
  }
  const workflows = artifacts.filter(item => item.kind === 'workflow')
  acyclic(workflows.map(item => item.digest), workflows.flatMap(item => item.definition.runPolicy.dependsOn.map((target: string) => [item.digest, target] as [string, string])))
  return { manifest, bundleSha256: sha256(bytes), artifacts }
}
