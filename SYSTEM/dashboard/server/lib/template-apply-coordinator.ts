import path from 'path'
import { InstanceTemplateCatalog } from './instance-template-catalog'
import { PortableTemplateError } from './portable-template-zip'
import { TemplateResourceOwnership, TemplateRevisionRequest, TemplateRevisionStore } from './template-revisions'
import { TemplateGatewayEntry, TemplateGatewayTransaction } from './template-gateway-transaction'
import { recoverWorkspaceFileTransaction } from './workspace-file-transaction'

const active = new Set<string>()

/** Coordinates the two durable journals while execution remains blocked.
 * The resource revision ledger is the commit decision. Recovery must settle
 * its file journal before deciding whether to keep or undo gateway entries.
 * This is an internal staging coordinator, not an execution admission API.
 */
export class TemplateApplyCoordinator {
  private root: string
  constructor(
    private store: TemplateRevisionStore,
    private gateway: TemplateGatewayTransaction,
    private agentStateRoot: string,
    private checkpoint?: (phase: 'gateway-registered' | 'resources-committed' | 'cleanup-prepared' | 'cleanup-committed') => void,
  ) {
    this.root = path.resolve(store.workspacePath)
    if (gateway.workspacePath !== this.root) throw new PortableTemplateError('invalid_plan', 'Gateway and resource transactions must target the same workspace')
    if (!path.isAbsolute(agentStateRoot)) throw new PortableTemplateError('invalid_plan', 'Server agent state root must be absolute')
  }
  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (active.has(this.root)) throw new PortableTemplateError('workspace_busy', 'Template apply or recovery is in progress', 409)
    active.add(this.root)
    try { return await operation() } finally { active.delete(this.root) }
  }
  private async reconcile() {
    recoverWorkspaceFileTransaction(this.root)
    return this.gateway.recover(digest => this.store.history().some(revision => revision.planDigest === digest && !revision.cleanedAt))
  }
  recover() { return this.exclusive(() => this.reconcile()) }

  async cleanup(actorId: string, revisionId: string, expectedRevision: string | null, planDigest: string, assertStopped: (resources: TemplateResourceOwnership) => void) {
    return this.exclusive(async () => {
      // Authorize before recovery so an unrelated actor cannot trigger cleanup.
      const revision = this.store.history().find(item => item.id === revisionId)
      if (!revision || revision.actorId !== actorId) throw new PortableTemplateError('revision_forbidden', 'Revision cleanup is not authorized', 403)
      await this.reconcile()
      if (revision.cleanedAt) return this.store.cleanup(actorId, revisionId, expectedRevision, assertStopped)
      const plan = this.store.planCleanup(actorId, revisionId, expectedRevision, assertStopped)
      if (plan.planDigest !== planDigest) throw new PortableTemplateError('stale_plan', 'Cleanup plan changed; plan again', 409)
      try {
        await this.gateway.prepareCleanup(revision.planDigest)
        this.checkpoint?.('cleanup-prepared')
        // Recheck resource contents and stopped state after gateway awaits.
        const fresh = this.store.planCleanup(actorId, revisionId, expectedRevision, assertStopped)
        if (fresh.planDigest !== planDigest) throw new PortableTemplateError('stale_plan', 'Cleanup plan changed; plan again', 409)
        const result = this.store.cleanup(actorId, revisionId, expectedRevision, assertStopped)
        this.checkpoint?.('cleanup-committed')
        await this.reconcile()
        return result
      } catch (error) {
        await this.reconcile()
        throw error
      }
    })
  }

  async apply(actorId: string, request: TemplateRevisionRequest, planDigest: string) {
    return this.exclusive(async () => {
      await this.reconcile()
      // Let the store validate exact request identity for an existing result.
      // Never re-register Agents when retrying a committed resource revision.
      if (this.store.history().some(revision => revision.actorId === actorId && revision.idempotencyKey === request.idempotencyKey)) return this.store.apply(actorId, request, planDigest)
      const plan = await this.store.plan(actorId, request)
      if (plan.planDigest !== planDigest) throw new PortableTemplateError('stale_plan', 'Template plan changed; plan again', 409)
      if (!plan.authority || plan.authority.workspaceId !== this.store.workspaceId) throw new PortableTemplateError('template_authority_unavailable', 'Server-owned authority bindings are required for gateway staging', 409)
      const bundle = await new InstanceTemplateCatalog(this.root, this.store.workspaceId).bundle(request.templateId)
      if (bundle.bundleSha256 !== plan.templateDigest) throw new PortableTemplateError('stale_plan', 'Template content changed; plan again', 409)
      const entries: Record<string, TemplateGatewayEntry> = {}
      for (const [artifactId, id] of Object.entries(plan.resources.agents)) {
        const artifact = bundle.artifacts.find(item => item.kind === 'agent' && item.id === artifactId)
        const binding = plan.authority.bindings.find(item => item.artifactId === artifactId)
        if (!artifact || !binding || binding.artifactDigest !== artifact.digest) throw new PortableTemplateError('invalid_plan', 'Gateway staging identity does not match the Template')
        entries[id] = {
          name: artifact.definition.name, workspace: path.join(this.root, 'AGENTS', id),
          agentDir: path.join(this.agentStateRoot, id, 'agent'), model: binding.model.id,
          skills: [], tools: { deny: ['*'] }, heartbeat: { every: '0m' },
        }
      }
      try {
        await this.gateway.register(planDigest, entries)
        this.checkpoint?.('gateway-registered')
        // Recompile after all gateway awaits: authority revocation, concurrent
        // resource changes, or catalog removal must prevent the file commit.
        const result = await this.store.apply(actorId, request, planDigest)
        this.checkpoint?.('resources-committed')
        await this.reconcile()
        return result
      } catch (error) {
        // If the ledger committed, preserve both halves. If not, roll back only
        // exact owned registrations. An unavailable gateway retains its journal
        // and blocks further apply instead of claiming rollback succeeded.
        await this.reconcile()
        throw error
      }
    })
  }
}
