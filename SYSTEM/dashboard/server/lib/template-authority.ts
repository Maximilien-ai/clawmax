import fs from 'fs'
import Ajv from 'ajv'
import { PortableTemplate, sha256 } from './portable-template'
import { PortableTemplateError } from './portable-template-zip'
import { TemplateBindingSelection } from './template-revisions'

const identifier = { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' }
const hash = { type: 'string', pattern: '^[a-f0-9]{64}$' }
const object = (properties: Record<string, object>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false })
const array = (items: object) => ({ type: 'array', items, maxItems: 128, uniqueItems: true })
const bindingSchema = object({
  id: identifier, revision: identifier, artifactId: identifier,
  artifactDigest: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' },
  actorIds: { ...array(identifier), minItems: 1 }, disabled: { type: 'boolean' },
  model: object({ id: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$' }, revision: identifier }),
  policy: object({ id: identifier, sha256: hash }),
  runtime: object({ platform: { type: 'string', enum: ['linux/amd64', 'linux/arm64', 'darwin/amd64', 'darwin/arm64'] }, revision: identifier }),
  skills: array(object({ name: { type: 'string', pattern: '^[a-z0-9][a-z0-9._-]{0,62}$' }, sha256: hash, platform: { type: 'string', enum: ['linux/amd64', 'linux/arm64'] } })),
  credentials: array(object({ name: { type: 'string', pattern: '^[A-Z][A-Z0-9_]{1,127}$' }, reference: identifier, revision: identifier })),
})
const validateRegistry = new Ajv().compile<TemplateAuthorityRegistry>(object({
  apiVersion: { const: 'clawmax.template-authority/v1alpha1' }, workspaceId: identifier,
  revision: identifier, bindings: array(bindingSchema),
}))
export interface TemplateAuthorityBinding {
  id: string; revision: string; artifactId: string; artifactDigest: string
  actorIds: string[]; disabled: boolean
  model: { id: string; revision: string }
  policy: { id: string; sha256: string }
  runtime: { platform: string; revision: string }
  skills: Array<{ name: string; sha256: string; platform: string }>
  credentials: Array<{ name: string; reference: string; revision: string }>
}
export interface TemplateAuthorityRegistry {
  apiVersion: 'clawmax.template-authority/v1alpha1'
  workspaceId: string; revision: string; bindings: TemplateAuthorityBinding[]
}
export interface TemplateAuthoritySource {
  /** Configured by server code, never a request field or client-supplied path. */
  read(): unknown
  runtime: { platform: string; revision: string }
}
export interface TemplateAuthorityContext { workspaceId: string; actorId: string }
function fail(message: string): never { throw new PortableTemplateError('template_authority_unavailable', message, 409) }
function canonical(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}
/** Read an administrator-configured registry, not a file from a portable bundle.
 * Provisioning and broker execution remain separate; there is no client write
 * route for this registry. Paths and file errors never enter public evidence.
 */
export function readTemplateAuthorityRegistry(file: string): unknown {
  let fd: number | undefined
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK)
    const stat = fs.fstatSync(fd)
    if (!stat.isFile() || stat.size > 1024 * 1024) fail('Authority registry is not a bounded regular file')
    return JSON.parse(fs.readFileSync(fd, 'utf8'))
  } catch { return fail('Authority registry is unavailable') }
  finally { if (fd !== undefined) fs.closeSync(fd) }
}

/** Selects named, server-owned authority identities for planning only.
 * Does not retrieve secret values, install Skills, authorize native tools, or
 * grant execution. Runtime admission remains blocked independently.
 */
export function resolveTemplateAuthority(bundle: PortableTemplate, selections: TemplateBindingSelection, context: TemplateAuthorityContext, source: TemplateAuthoritySource) {
  let input: unknown
  try { input = source.read() } catch { return fail('Authority registry is unavailable') }
  if (!validateRegistry(input)) fail('Authority registry has unsupported fields')
  const registry = input
  if (registry.workspaceId !== context.workspaceId) fail('Authority registry belongs to another workspace')
  if (new Set(registry.bindings.map(item => item.id)).size !== registry.bindings.length) fail('Authority binding identities are ambiguous')
  const agents = bundle.artifacts.filter(item => item.kind === 'agent')
  if (Object.keys(selections).length !== agents.length || Object.keys(selections).some(id => !agents.some(agent => agent.id === id))) fail('Exactly one named binding is required per Agent')
  const requirements = new Map<string, any>(bundle.manifest.secretRequirements.map((item: any) => [item.name, item]))
  const covered = new Set<string>()
  const bindings = agents.map(agent => {
    const selected = registry.bindings.find(item => item.id === selections[agent.id])
    if (!selected || selected.disabled || !selected.actorIds.includes(context.actorId) || selected.artifactId !== agent.id || selected.artifactDigest !== agent.digest) fail('Named binding is not authorized for this Agent and actor')
    if (selected.runtime.platform !== source.runtime.platform || selected.runtime.revision !== source.runtime.revision) fail('Named binding targets a different runtime')
    const requestedSkills = [...agent.definition.skills].sort()
    const skills = structuredClone(selected.skills).sort((a, b) => a.name.localeCompare(b.name))
    if (JSON.stringify(skills.map(item => item.name)) !== JSON.stringify(requestedSkills)) fail('Named binding must match the exact requested Skills')
    if (skills.some(item => item.platform !== source.runtime.platform || !source.runtime.platform.startsWith('linux/'))) fail('Skill platform does not match the execution runtime')
    if (new Set(selected.credentials.map(item => item.name)).size !== selected.credentials.length) fail('Named credential requirements are ambiguous')
    for (const credential of selected.credentials) {
      if (!requirements.has(credential.name)) fail('Named binding includes an undeclared credential')
      covered.add(credential.name)
    }
    // Project exact fields rather than returning actor ACLs or raw registry data.
    return {
      artifactId: agent.id, artifactDigest: agent.digest, bindingId: selected.id, bindingRevision: selected.revision,
      model: structuredClone(selected.model), policy: structuredClone(selected.policy), runtime: structuredClone(selected.runtime),
      skills, credentials: structuredClone(selected.credentials).sort((a, b) => a.name.localeCompare(b.name)),
    }
  }).sort((a, b) => a.artifactId.localeCompare(b.artifactId))
  for (const [name, requirement] of requirements) if (requirement.required && !covered.has(name)) fail('A required named credential has no Agent binding')
  const evidence = { registryRevision: registry.revision, workspaceId: context.workspaceId, bindings }
  return { ...evidence, digest: sha256(canonical(evidence)) }
}
