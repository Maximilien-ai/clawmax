import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import type { Workspace } from './workspace-manager'

export const CLEAR_RECEIPT = '.clawmax-workspace-clear.json'
export class WorkspaceClearError extends Error {
  constructor(message: string, public status = 409) { super(message) }
}
export interface ClearPlan {
  root: string
  identity: string
  entries: string[]
  agents: string[]
  counts: Record<string, number>
  revision: string
}
export interface ClearReceipt {
  operationId: string
  state: 'running' | 'failed' | 'complete'
  plan: ClearPlan
  updatedAt: string
}
export interface ClearDependencies {
  workspaces(): Workspace[]
  protectedRoots(): string[]
  inspectRuntime(root: string, agents: string[]): void
  prepareRuntime(root: string, agents: string[]): Promise<void>
  finishRuntime(root: string): void
}
const inside = (parent: string, child: string) => child === parent || child.startsWith(parent + path.sep)
export class WorkspaceClearService {
  private previews = new Map<string, { actor: string; plan: ClearPlan; expires: number }>()
  private running = false
  constructor(private deps: ClearDependencies) {}

  private root(): { root: string; identity: string } {
    const workspaces = this.deps.workspaces()
    const workspace = workspaces.find(item => item.id === 'default')
    if (!workspace) throw new WorkspaceClearError('Personal workspace not found', 404)
    const root = path.resolve(workspace.path)
    const stat = fs.lstatSync(root)
    if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(root) !== root
      || root === path.parse(root).root
      || this.deps.protectedRoots().some(protectedRoot => inside(root, path.resolve(protectedRoot)))
      || fs.existsSync(path.join(root, '.git'))
      || workspaces.some(other => other.id !== 'default' && (inside(root, path.resolve(other.path)) || inside(path.resolve(other.path), root)))) {
      throw new WorkspaceClearError('Personal has an unsafe or overlapping path; no content was cleared')
    }
    return { root, identity: `${stat.dev}:${stat.ino}` }
  }

  receipt(): ClearReceipt | null {
    const { root } = this.root()
    const file = path.join(root, CLEAR_RECEIPT)
    if (!fs.existsSync(file)) return null
    if (!fs.lstatSync(file).isFile()) throw new WorkspaceClearError('Invalid clear-operation record')
    const receipt = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!['running', 'failed', 'complete'].includes(receipt.state) || receipt.plan?.root !== root
      || !Array.isArray(receipt.plan.entries) || receipt.plan.entries.some((name: unknown) => typeof name !== 'string' || name !== path.basename(name) || name === '.' || name === '..' || name === CLEAR_RECEIPT)
      || !Array.isArray(receipt.plan.agents) || receipt.plan.agents.some((id: unknown) => typeof id !== 'string' || !/^[a-z][a-z0-9_-]*$/.test(id))) {
      throw new WorkspaceClearError('Invalid clear-operation record')
    }
    return receipt
  }

  private inventory(): ClearPlan {
    const { root, identity } = this.root()
    const entries = fs.readdirSync(root).filter(name => name !== CLEAR_RECEIPT).sort()
    const counts: Record<string, number> = {}
    const fingerprint: string[] = []
    let total = 0
    const walk = (file: string, category: string) => {
      const stat = fs.lstatSync(file)
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new WorkspaceClearError('Linked or special workspace files require manual review before clearing')
      if (++total > 100000) throw new WorkspaceClearError('Workspace inventory is too large for interactive clearing')
      fingerprint.push(`${path.relative(root, file)}:${stat.ino}:${stat.size}:${stat.mtimeMs}`)
      if (stat.isDirectory()) for (const name of fs.readdirSync(file).sort()) walk(path.join(file, name), category)
      else counts[category] = (counts[category] || 0) + 1
    }
    for (const name of entries) walk(path.join(root, name), name === 'AGENTS' ? 'Agent files and history' : name === 'WORKFLOWS' ? 'Workflow definitions, history and outputs' : name === 'ORG' ? 'Groups, communities and organization files' : name === 'SKILLS' ? 'Workspace skills' : name === 'TEMPLATES' ? 'Workspace templates' : 'Other workspace files and settings')
    const agents: string[] = []
    for (const subdir of ['AGENTS', 'AGENTS/archive']) {
      const directory = path.join(root, subdir)
      if (!fs.existsSync(directory)) continue
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name === 'archive') continue
        if (!/^[a-z][a-z0-9_-]*$/.test(entry.name)) throw new WorkspaceClearError('Unrecognized agent directory requires manual review')
        agents.push(entry.name)
      }
    }
    this.deps.inspectRuntime(root, [...new Set(agents)])
    return { root, identity, entries, agents: [...new Set(agents)], counts, revision: crypto.createHash('sha256').update(JSON.stringify(fingerprint)).digest('hex') }
  }

  preview(actor: string) {
    if (this.running) throw new WorkspaceClearError('Personal is already being cleared')
    const receipt = this.receipt()
    const fresh = this.inventory()
    const plan = receipt && receipt.state !== 'complete' ? receipt.plan : fresh
    if (plan.identity !== fresh.identity) throw new WorkspaceClearError('Workspace directory changed; manual recovery required')
    for (const [key, item] of this.previews) if (item.expires < Date.now()) this.previews.delete(key)
    if (this.previews.size >= 100) throw new WorkspaceClearError('Too many pending confirmations; retry later', 429)
    const token = crypto.randomUUID()
    this.previews.set(token, { actor, plan, expires: Date.now() + 10 * 60_000 })
    return { token, counts: plan.counts, agentCount: plan.agents.length, resume: !!receipt && receipt.state !== 'complete', lastOutcome: receipt?.state || null }
  }

  async clear(actor: string, body: { token?: unknown; confirmation?: unknown; acknowledged?: unknown }) {
    const preview = typeof body.token === 'string' ? this.previews.get(body.token) : undefined
    if (!preview || preview.actor !== actor || preview.expires < Date.now() || body.confirmation !== 'CLEAR PERSONAL' || body.acknowledged !== true) {
      throw new WorkspaceClearError('Review the impact again and type CLEAR PERSONAL to confirm', 400)
    }
    if (this.running) throw new WorkspaceClearError('Personal is already being cleared')
    const fresh = this.inventory()
    const previous = this.receipt()
    const retry = previous && previous.state !== 'complete'
    const plan = preview.plan
    if (fresh.identity !== plan.identity || (!retry && fresh.revision !== plan.revision)
      || fresh.entries.some(name => !plan.entries.includes(name))) throw new WorkspaceClearError('Workspace changed; review its impact again')
    this.previews.delete(body.token as string)
    this.running = true
    const receipt: ClearReceipt = { operationId: retry ? previous.operationId : crypto.randomUUID(), state: 'running', plan, updatedAt: new Date().toISOString() }
    const save = () => {
      receipt.updatedAt = new Date().toISOString()
      const file = path.join(plan.root, CLEAR_RECEIPT)
      // One synchronous small write; a torn record fails closed on restart.
      fs.writeFileSync(file, JSON.stringify(receipt), { mode: 0o600 })
    }
    try {
      save()
      await this.deps.prepareRuntime(plan.root, fresh.agents)
      if (this.root().identity !== plan.identity) throw new WorkspaceClearError('Workspace directory changed during clearing')
      // Validate the remaining tree again immediately before irreversible cleanup.
      const remaining = this.inventory()
      if (remaining.entries.some(name => !plan.entries.includes(name))) throw new WorkspaceClearError('New content appeared during clearing')
      for (const name of plan.entries) fs.rmSync(path.join(plan.root, name), { recursive: true, force: true })
      fs.mkdirSync(path.join(plan.root, 'AGENTS', 'archive'), { recursive: true })
      fs.mkdirSync(path.join(plan.root, 'ORG'), { recursive: true })
      fs.mkdirSync(path.join(plan.root, 'SYSTEM'), { recursive: true })
      fs.writeFileSync(path.join(plan.root, 'ORG', 'COMMUNITIES.md'), '# Communities\n\n')
      fs.writeFileSync(path.join(plan.root, 'ORG', 'GROUPS.md'), '# Groups\n\n')
      receipt.state = 'complete'
      save()
      this.deps.finishRuntime(plan.root)
      return { ok: true, operationId: receipt.operationId }
    } catch {
      receipt.state = 'failed'
      save()
      throw new WorkspaceClearError('Personal clearing did not finish. Some content or registrations may have been removed. Open Clear Personal again to review and retry; the workspace is protected from new work.', 503)
    } finally { this.running = false }
  }
}
