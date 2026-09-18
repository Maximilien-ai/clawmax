import fs from 'fs'
import path from 'path'
import { InstanceTemplateCatalog, validResourceId } from './instance-template-catalog'
import { PortableTemplate, sha256 } from './portable-template'
import { PortableTemplateError } from './portable-template-zip'
import { commitWorkspaceFiles, WorkspaceFileMutation } from './workspace-file-transaction'

export interface TemplateBindingSelection { [artifactId: string]: string }
export interface TemplateRevisionRequest {
  templateId: string
  expectedRevision: string | null
  idempotencyKey: string
  bindings: TemplateBindingSelection
}
export interface TemplateResourceOwnership {
  agents: Record<string, string>
  communities: Record<string, string>
  groups: Record<string, string>
  workflows: Record<string, string>
}
export interface CompiledTemplate {
  resources: TemplateResourceOwnership
  mutations: WorkspaceFileMutation[]
  // Immutable server-owned authority identities, never secret values or paths.
  authorityDigest: string
}
export type TemplateCompiler = (bundle: PortableTemplate, request: TemplateRevisionRequest, resourcePrefix: string) => CompiledTemplate
export interface TemplateRevisionPlan {
  apiVersion: 'clawmax.instance/v1'
  kind: 'TemplatePlan'
  workspaceId: string
  actorId: string
  request: TemplateRevisionRequest
  templateDigest: string
  authorityDigest: string
  resources: TemplateResourceOwnership
  changes: Array<{ path: string; before: string | null; after: string | null }>
  planDigest: string
}
interface Revision {
  id: string; actorId: string; idempotencyKey: string; requestDigest: string
  planDigest: string; templateId: string; templateDigest: string; authorityDigest: string
  resources: TemplateResourceOwnership; createdAt: string; cleanedAt?: string
  // Private rollback/cleanup data never returned through the public API.
  undo: WorkspaceFileMutation[]
}
interface RevisionState { version: 1; current: string | null; revisions: Revision[] }
const stateRelativePath = 'SYSTEM/.clawmax/template-revisions.json'
function canonical(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}
function publicRevision(revision: Revision) { const { undo: _undo, requestDigest: _requestDigest, ...result } = revision; return result }

/** Owns revision state and exact cleanup independently of the resource compiler.
 * The compiler must reject unsupported runtime/authority semantics, not silently
 * flatten portable graph edges or propagate credentials through memberships.
 */
export class TemplateRevisionStore {
  constructor(readonly workspacePath: string, readonly workspaceId: string, readonly compiler: TemplateCompiler) {}
  private read(): { state: RevisionState; bytes: Buffer | null } {
    if (fs.existsSync(path.join(this.workspacePath, '.clawmax', 'template-transaction.json'))) throw new PortableTemplateError('workspace_recovery_required', 'Recover the workspace transaction before planning', 503)
    const file = path.join(this.workspacePath, stateRelativePath)
    if (!fs.existsSync(file)) return { state: { version: 1, current: null, revisions: [] }, bytes: null }
    const bytes = fs.readFileSync(file)
    try {
      const state = JSON.parse(bytes.toString('utf8'))
      if (state.version !== 1 || !Array.isArray(state.revisions) || (state.current !== null && !validResourceId(state.current))) throw new Error('invalid state')
      return { state, bytes }
    } catch { throw new PortableTemplateError('revision_store_unavailable', 'Workspace revision state is unreadable', 503) }
  }
  private validateRequest(request: TemplateRevisionRequest) {
    if (!request || Object.keys(request).some(key => !['templateId', 'expectedRevision', 'idempotencyKey', 'bindings'].includes(key)) || !validResourceId(request.templateId) || !validResourceId(request.idempotencyKey) || (request.expectedRevision !== null && !validResourceId(request.expectedRevision)) || !request.bindings || Array.isArray(request.bindings) || typeof request.bindings !== 'object' || Object.entries(request.bindings).some(([artifact, binding]) => !validResourceId(artifact) || !validResourceId(binding))) throw new PortableTemplateError('invalid_request', 'Invalid Template revision request')
  }
  private buildPlan(actorId: string, request: TemplateRevisionRequest, bundle: PortableTemplate, compiled: CompiledTemplate): TemplateRevisionPlan {
    const payload = {
      apiVersion: 'clawmax.instance/v1' as const, kind: 'TemplatePlan' as const,
      workspaceId: this.workspaceId, actorId, request,
      templateDigest: bundle.bundleSha256, authorityDigest: compiled.authorityDigest,
      resources: compiled.resources,
      changes: compiled.mutations.map(item => ({ path: item.path, before: item.expectedSha256, after: item.content === null ? null : sha256(item.content) })),
    }
    return { ...payload, planDigest: sha256(canonical(payload)) }
  }
  private async prepare(actorId: string, request: TemplateRevisionRequest) {
    this.validateRequest(request)
    const bundle = await new InstanceTemplateCatalog(this.workspacePath, this.workspaceId).bundle(request.templateId)
    new InstanceTemplateCatalog(this.workspacePath, this.workspaceId).get(request.templateId)
    const state = this.read()
    if (state.state.current !== request.expectedRevision) throw new PortableTemplateError('stale_revision', 'Workspace revision changed; plan again', 409)
    const prefix = `tr-${sha256(canonical({ actorId, workspaceId: this.workspaceId, request })).slice(0, 16)}`
    const compiled = this.compiler(bundle, request, prefix)
    if (compiled.mutations.some(item => item.path === stateRelativePath)) throw new PortableTemplateError('invalid_plan', 'A Template cannot overwrite the revision ledger')
    return { ...state, compiled, plan: this.buildPlan(actorId, request, bundle, compiled) }
  }
  async plan(actorId: string, request: TemplateRevisionRequest): Promise<TemplateRevisionPlan> {
    return (await this.prepare(actorId, request)).plan
  }
  async apply(actorId: string, request: TemplateRevisionRequest, planDigest: string) {
    this.validateRequest(request)
    const requestDigest = sha256(canonical(request))
    const replay = this.read().state.revisions.find(entry => entry.actorId === actorId && entry.idempotencyKey === request.idempotencyKey)
    if (replay) {
      if (replay.requestDigest !== requestDigest || replay.planDigest !== planDigest || replay.cleanedAt) throw new PortableTemplateError('idempotency_conflict', 'Apply key was used for a different or cleaned revision', 409)
      return { created: false, revision: publicRevision(replay) }
    }
    let prepared: Awaited<ReturnType<TemplateRevisionStore['prepare']>>
    try { prepared = await this.prepare(actorId, request) } catch (error) {
      // Two identical callers can both enter before ZIP validation settles.
      // The later caller must replay the winner, not report a stale revision.
      const concurrent = this.read().state.revisions.find(entry => entry.actorId === actorId && entry.idempotencyKey === request.idempotencyKey)
      if (concurrent && concurrent.requestDigest === requestDigest && concurrent.planDigest === planDigest && !concurrent.cleanedAt) return { created: false, revision: publicRevision(concurrent) }
      throw error
    }
    if (prepared.plan.planDigest !== planDigest) throw new PortableTemplateError('stale_plan', 'Template, resources, or authority changed; plan again', 409)
    const undo = prepared.compiled.mutations.map(item => {
      const file = path.join(this.workspacePath, item.path)
      const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
      return { path: item.path, expectedSha256: item.content === null ? null : sha256(item.content), content: before }
    })
    const revision: Revision = {
      id: `rev_${planDigest.slice(0, 32)}`, actorId, idempotencyKey: request.idempotencyKey,
      requestDigest, planDigest, templateId: request.templateId,
      templateDigest: prepared.plan.templateDigest, authorityDigest: prepared.plan.authorityDigest,
      resources: prepared.compiled.resources, createdAt: new Date().toISOString(), undo,
    }
    const next: RevisionState = { version: 1, current: revision.id, revisions: [...prepared.state.revisions, revision] }
    commitWorkspaceFiles(this.workspacePath, [...prepared.compiled.mutations, { path: stateRelativePath, expectedSha256: prepared.bytes ? sha256(prepared.bytes) : null, content: JSON.stringify(next) }])
    return { created: true, revision: publicRevision(revision) }
  }
  history() { return this.read().state.revisions.map(publicRevision) }
  currentRevision() { return this.read().state.current }
  cleanup(actorId: string, revisionId: string, expectedRevision: string | null, assertStopped: (resources: TemplateResourceOwnership) => void) {
    const { state, bytes } = this.read()
    const revision = state.revisions.find(entry => entry.id === revisionId)
    if (!revision || revision.actorId !== actorId) throw new PortableTemplateError('revision_forbidden', 'Revision cleanup is not authorized', 403)
    if (revision.cleanedAt) return { removed: false, currentRevision: state.current, revision: publicRevision(revision) }
    if (state.current !== expectedRevision) throw new PortableTemplateError('stale_revision', 'Workspace revision changed; plan cleanup again', 409)
    assertStopped(revision.resources)
    revision.cleanedAt = new Date().toISOString()
    state.current = `cleanup_${sha256(`${revision.id}:${revision.cleanedAt}`).slice(0, 32)}`
    commitWorkspaceFiles(this.workspacePath, [...revision.undo, { path: stateRelativePath, expectedSha256: sha256(bytes!), content: JSON.stringify(state) }])
    return { removed: true, currentRevision: state.current, revision: publicRevision(revision) }
  }
}
