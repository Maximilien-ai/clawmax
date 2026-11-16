import path from 'path'
import fs from 'fs'
import { isDeepStrictEqual } from 'util'
import { InstanceTemplateCatalog } from './instance-template-catalog'
import { PortableTemplateError } from './portable-template-zip'
import { TemplateResourceOwnership, TemplateRevisionRequest, TemplateRevisionStore } from './template-revisions'
import { TemplateGatewayEntry, TemplateGatewayTransaction } from './template-gateway-transaction'
import { recoverWorkspaceFileTransaction } from './workspace-file-transaction'
import { revalidateTemplateAuthority, TemplateAuthoritySource } from './template-authority'
import { templateStoragePath } from './template-storage-path'
import { TemplateExecutionPolicySource, verifyTemplateExecutionPolicies } from './template-execution-policy'
import { recordTemplateExecution } from './template-execution-receipts'
import { sha256 } from './portable-template'
import type { GatewayRPCClient } from './gateway-rpc'
import type { CompiledTemplateGroup } from './template-resource-graph'

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
  get workspacePath(): string { return this.root }
  get workspaceId(): string { return this.store.workspaceId }
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

  /** Internal, read-only staging check. This is not an execution grant: policy,
   * Skill and credential enforcement, graph execution and queue admission must
   * still be provided by the runtime. Never expose the authority source to a
   * request or cache this evidence as permission for a later execution.
   */
  verifyStagedExecution(actorId: string, revisionId: string, resourceId: string, source: TemplateAuthoritySource, policies: TemplateExecutionPolicySource) {
    return this.exclusive(() => this.verifyStaged(actorId, revisionId, resourceId, source, policies))
  }
  private async verifyStaged(actorId: string, revisionId: string, resourceId: string, source: TemplateAuthoritySource, policies: TemplateExecutionPolicySource) {
      const revision = this.store.verifyExecutionResources(actorId, revisionId, resourceId)
      if (!revision.authority) throw new PortableTemplateError('template_authority_unavailable', 'Committed server-owned authority is required', 409)
      const context = { workspaceId: this.store.workspaceId, actorId }
      const authority = revalidateTemplateAuthority(revision.authority, revision.authorityDigest, context, source)
      verifyTemplateExecutionPolicies(authority, policies)
      const entries: Record<string, TemplateGatewayEntry> = {}
      const agents = Object.entries(revision.resources.agents)
      if (agents.length !== authority.bindings.length) throw new PortableTemplateError('template_authority_unavailable', 'Revision agents do not match committed authority', 409)
      for (const [artifactId, id] of agents) {
        const binding = authority.bindings.find(item => item.artifactId === artifactId)
        const agent = JSON.parse(fs.readFileSync(templateStoragePath(this.root, `AGENTS/${id}/TEMPLATE_RESOURCE.json`), 'utf8'))
        if (!binding || agent.id !== id || agent.artifactId !== artifactId || agent.digest !== binding.artifactDigest) throw new PortableTemplateError('template_authority_unavailable', 'Revision agent identity does not match committed authority', 409)
        entries[id] = {
          name: agent.name, workspace: path.join(this.root, 'AGENTS', id),
          agentDir: path.join(this.agentStateRoot, id, 'agent'), model: binding.model.id,
          skills: [], tools: { deny: ['*'] }, heartbeat: { every: '0m' },
        }
      }
      const gateway = await this.gateway.verifyCommitted(revision.planDigest, entries)
      const fresh = this.store.verifyExecutionResources(actorId, revisionId, resourceId)
      if (!isDeepStrictEqual(fresh, revision)) throw new PortableTemplateError('stale_revision', 'Revision changed during verification', 409)
      const freshAuthority = revalidateTemplateAuthority(fresh.authority!, fresh.authorityDigest, context, source)
      verifyTemplateExecutionPolicies(freshAuthority, policies)
      return { revisionId: revision.id, planDigest: revision.planDigest, authorityDigest: revision.authorityDigest, gatewayHash: gateway.hash }
  }

  /** Server-owned no-tools executor, separate from general agent queues.
   * Holds the workspace lock through settlement and persists uncertain
   * dispatches, so cleanup cannot race or silently forget a live model call.
   */
  executeNoToolsAgent(actorId: string, revisionId: string, input: { agentId: string; message: string; idempotencyKey: string }, source: TemplateAuthoritySource, policies: TemplateExecutionPolicySource, runtime: Pick<GatewayRPCClient, 'runNoToolsTemplateAgent'>, assertAuthorized: () => void = () => {}) {
    return this.exclusive(async () => {
      assertAuthorized()
      if (!input || Object.keys(input).some(key => !['agentId', 'message', 'idempotencyKey'].includes(key)) || typeof input.message !== 'string' || !input.message.trim() || Buffer.byteLength(input.message) > 1024 * 1024 || typeof input.idempotencyKey !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.idempotencyKey)) throw new PortableTemplateError('invalid_request', 'Invalid Template execution request')
      await this.verifyStaged(actorId, revisionId, input.agentId, source, policies)
      assertAuthorized()
      const revision = this.store.verifyExecutionResources(actorId, revisionId, input.agentId)
      const authority = revalidateTemplateAuthority(revision.authority!, revision.authorityDigest, { workspaceId: this.workspaceId, actorId }, source)
      verifyTemplateExecutionPolicies(authority, policies)
      const artifactId = Object.entries(revision.resources.agents).find(([, id]) => id === input.agentId)?.[0]
      const binding = revision.authority?.bindings.find(item => item.artifactId === artifactId)
      if (!binding) throw new PortableTemplateError('revision_forbidden', 'Execution target must be a revision-owned Agent', 403)
      const instructions = fs.readFileSync(templateStoragePath(this.root, `AGENTS/${input.agentId}/SOUL.md`), 'utf8')
      const requestHash = sha256(JSON.stringify([actorId, this.workspaceId, revisionId, input.agentId, input.message]))
      return recordTemplateExecution(this.root, revisionId, input.idempotencyKey, requestHash, idempotencyKey => runtime.runNoToolsTemplateAgent({ agentId: input.agentId, model: binding.model.id, instructions, message: input.message, idempotencyKey }))
    })
  }

  /** Explicit internal bounded run. Does not activate a stopped Group or any
   * schedules. A single durable claim covers the whole graph: unknown outcomes
   * block redispatch and cleanup, including after a partial multi-agent run. */
  executeNoToolsGroup(actorId: string, revisionId: string, input: { groupId: string; message: string; idempotencyKey: string }, source: TemplateAuthoritySource, policies: TemplateExecutionPolicySource, runtime: Pick<GatewayRPCClient, 'runNoToolsTemplateAgent'>, assertAuthorized: () => void = () => {}) {
    return this.exclusive(async () => {
      assertAuthorized()
      if (!input || Object.keys(input).some(key => !['groupId', 'message', 'idempotencyKey'].includes(key))
        || typeof input.message !== 'string' || !input.message.trim() || Buffer.byteLength(input.message) > 65536
        || typeof input.idempotencyKey !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.idempotencyKey)) throw new PortableTemplateError('invalid_request', 'Invalid Group execution request')
      await this.verifyStaged(actorId, revisionId, input.groupId, source, policies)
      assertAuthorized()
      const revision = this.store.verifyExecutionResources(actorId, revisionId, input.groupId)
      if (!Object.values(revision.resources.groups).includes(input.groupId)) throw new PortableTemplateError('revision_forbidden', 'Execution target must be a revision-owned Group', 403)
      const group = JSON.parse(fs.readFileSync(templateStoragePath(this.root, `ORG/template-groups/${input.groupId}.json`), 'utf8')) as CompiledTemplateGroup
      if (group.state !== 'stopped' || Buffer.byteLength(input.message) > group.limits.maxMessageBytes) throw new PortableTemplateError('invalid_request', 'Group state or input exceeds the admitted contract')
      const requestHash = sha256(JSON.stringify(['group', actorId, this.workspaceId, revisionId, input.groupId, input.message]))
      return recordTemplateExecution(this.root, revisionId, input.idempotencyKey, requestHash, async runId => {
        const queue = group.entryMemberIds.map(memberId => ({ memberId, from: 'actor', message: input.message }))
        const turns: Array<{ sequence: number; memberId: string; agentId: string; from: string; runId: string; text: string }> = []
        let messages = queue.length
        let limited = messages > group.limits.maxMessages
        if (limited) throw new PortableTemplateError('invalid_request', 'Group entry messages exceed the message limit')
        while (queue.length && turns.length < group.limits.maxTurns && messages < group.limits.maxMessages) {
          const job = queue.shift()!
          const member = group.members.find(item => item.id === job.memberId)
          if (!member) throw new PortableTemplateError('invalid_template_graph', 'Group member is missing')
          // Recheck policy, gateway ownership, resource integrity and caller
          // authorization at every handoff, not just at the beginning of a run.
          await this.verifyStaged(actorId, revisionId, input.groupId, source, policies)
          assertAuthorized()
          const current = this.store.verifyExecutionResources(actorId, revisionId, member.agentId)
          const artifactId = Object.entries(current.resources.agents).find(([, id]) => id === member.agentId)?.[0]
          const binding = current.authority!.bindings.find(item => item.artifactId === artifactId)
          if (!binding) throw new PortableTemplateError('revision_forbidden', 'Group member authority is missing', 403)
          const instructions = fs.readFileSync(templateStoragePath(this.root, `AGENTS/${member.agentId}/SOUL.md`), 'utf8')
          const reply = await runtime.runNoToolsTemplateAgent({ agentId: member.agentId, model: binding.model.id, instructions,
            message: JSON.stringify({ objective: group.objective, role: member.role, from: job.from, content: job.message }),
            idempotencyKey: `${runId}-${turns.length + 1}` })
          assertAuthorized()
          if (!reply?.runId || typeof reply.text !== 'string' || !reply.text.trim() || Buffer.byteLength(reply.text) > group.limits.maxMessageBytes) throw new PortableTemplateError('group_output_invalid', 'Group reply is empty or exceeds its message limit')
          turns.push({ sequence: turns.length + 1, memberId: member.id, agentId: member.agentId, from: job.from, runId: reply.runId, text: reply.text })
          messages++
          for (const recipient of member.sendTo) {
            if (messages >= group.limits.maxMessages) { limited = true; break }
            queue.push({ memberId: recipient, from: member.id, message: reply.text })
            messages++
          }
          if (Buffer.byteLength(JSON.stringify(turns)) > 1024 * 1024) throw new PortableTemplateError('group_output_invalid', 'Group transcript exceeds the server limit')
        }
        if (!turns.length) throw new PortableTemplateError('group_output_invalid', 'Group limits allowed no reply')
        const stopReason = limited || (queue.length && messages >= group.limits.maxMessages) ? 'message_limit' : queue.length ? 'turn_limit' : 'drained'
        return { runId, text: JSON.stringify({ groupId: group.id, stopReason, turns }) }
      })
    })
  }

  async cleanup(actorId: string, revisionId: string, expectedRevision: string | null, planDigest: string, assertStopped: (resources: TemplateResourceOwnership) => void, assertAuthorized: () => void = () => {}) {
    return this.exclusive(async () => {
      assertAuthorized()
      // Authorize before recovery so an unrelated actor cannot trigger cleanup.
      const revision = this.store.history().find(item => item.id === revisionId)
      if (!revision || revision.actorId !== actorId) throw new PortableTemplateError('revision_forbidden', 'Revision cleanup is not authorized', 403)
      await this.reconcile()
      assertAuthorized()
      if (revision.cleanedAt) return this.store.cleanup(actorId, revisionId, expectedRevision, assertStopped)
      const plan = this.store.planCleanup(actorId, revisionId, expectedRevision, assertStopped)
      if (plan.planDigest !== planDigest) throw new PortableTemplateError('stale_plan', 'Cleanup plan changed; plan again', 409)
      try {
        await this.gateway.prepareCleanup(revision.planDigest)
        assertAuthorized()
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

  async apply(actorId: string, request: TemplateRevisionRequest, planDigest: string, assertAuthorized: () => void = () => {}) {
    return this.exclusive(async () => {
      assertAuthorized()
      await this.reconcile()
      assertAuthorized()
      // Let the store validate exact request identity for an existing result.
      // Never re-register Agents when retrying a committed resource revision.
      if (this.store.history().some(revision => revision.actorId === actorId && revision.idempotencyKey === request.idempotencyKey)) return this.store.apply(actorId, request, planDigest, assertAuthorized)
      const plan = await this.store.plan(actorId, request)
      assertAuthorized()
      if (plan.planDigest !== planDigest) throw new PortableTemplateError('stale_plan', 'Template plan changed; plan again', 409)
      if (!plan.authority || plan.authority.workspaceId !== this.store.workspaceId) throw new PortableTemplateError('template_authority_unavailable', 'Server-owned authority bindings are required for gateway staging', 409)
      const bundle = await new InstanceTemplateCatalog(this.root, this.store.workspaceId).bundle(request.templateId)
      assertAuthorized()
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
        await this.gateway.register(planDigest, entries, assertAuthorized)
        assertAuthorized()
        this.checkpoint?.('gateway-registered')
        // Recompile after all gateway awaits: authority revocation, concurrent
        // resource changes, or catalog removal must prevent the file commit.
        const result = await this.store.apply(actorId, request, planDigest, assertAuthorized)
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
