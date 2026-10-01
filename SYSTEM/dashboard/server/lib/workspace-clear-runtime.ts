import fs from 'fs'
import path from 'path'
import os from 'os'
import { getWorkspaceManager } from './workspace-manager'
import { WorkspaceClearService, WorkspaceClearError } from './workspace-clear'
import { withWorkspaceClearOwner } from './workspace-recovery-admission'
import { materializeDashboardAgentList } from './openclaw-config'
import { getGatewayClient } from './gateway-rpc'
import { listActiveTurns } from './agent-turns'
import { beginAgentDeletion, finishAgentDeletion } from './agent-lifecycle-state'
import { listWorkflows, listExecutions } from './workflows'
import { getSchedulerDiagnostics, unscheduleWorkflow } from './scheduler'
import { clearPinnedOpenClawWorkspaceState } from './openclaw-workspace-state'
import { REPO_ROOT } from './paths'
import { ensureClearKeeper, inspectClearKeeper, KEEPER_ID } from './workspace-clear-keeper'

const stateRoot = () => path.resolve(process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), '.openclaw'))
const configPath = () => process.env.OPENCLAW_CONFIG_PATH || path.join(stateRoot(), 'openclaw.json')
function roster(): any[] {
  if (!fs.existsSync(configPath())) return []
  return materializeDashboardAgentList(JSON.parse(fs.readFileSync(configPath(), 'utf8')))
}
function scoped<T>(root: string, work: () => T): T {
  // Only the internal cleanup owner may read its fenced workspace.
  return withWorkspaceClearOwner(root, work)
}
function inspect(root: string, agents: string[]) {
  if (getWorkspaceManager().getActiveWorkspaceId() !== 'default') throw new WorkspaceClearError('Switch to Personal before clearing it')
  if (listActiveTurns().length || getSchedulerDiagnostics().status === 'running') throw new WorkspaceClearError('Wait for active chats and scheduler synchronization to finish before clearing Personal')
  const records = roster()
  const config = fs.existsSync(configPath()) ? JSON.parse(fs.readFileSync(configPath(), 'utf8')) : {}
  if (agents.includes(KEEPER_ID)) throw new WorkspaceClearError('A Personal agent uses the reserved runtime keeper ID; rename it before clearing')
  if (agents.includes('main') || agents.includes(config.agents?.defaults?.authInheritance?.agentId)) {
    throw new WorkspaceClearError('Personal contains a possible shared-credential owner. Shared credentials must be safely relocated and verified before clearing; no content was cleared.')
  }
  if (records.some(record => record.id === KEEPER_ID) || (records.length && records.every(record => agents.includes(record.id)))) {
    inspectClearKeeper(stateRoot(), config, getWorkspaceManager().loadRegistry().workspaces.map(workspace => path.resolve(workspace.path)))
  }
  for (const record of records) {
    const workspace = path.resolve(record.workspace || '/')
    if (workspace.startsWith(root + path.sep) && (!agents.includes(record.id) || workspace !== path.join(root, 'AGENTS', record.id))) {
      throw new WorkspaceClearError('Nonstandard runtime registration requires manual review before clearing')
    }
  }
  for (const id of agents) {
    if (records.some(record => record.id === id && path.resolve(record.workspace || '/') !== path.join(root, 'AGENTS', id))
      || getWorkspaceManager().loadRegistry().workspaces.some(workspace => workspace.id !== 'default'
        && (fs.existsSync(path.join(workspace.path, 'AGENTS', id)) || fs.existsSync(path.join(workspace.path, 'AGENTS', 'archive', id))))) {
      throw new WorkspaceClearError('An agent ID is shared with another workspace; resolve that ownership before clearing')
    }
    if (fs.existsSync(path.join(os.homedir(), `.openclaw-${id}`))) throw new WorkspaceClearError('A legacy agent profile requires manual cleanup before clearing Personal')
    const directory = path.join(stateRoot(), 'agents', id)
    if (fs.existsSync(directory) && (fs.lstatSync(directory).isSymbolicLink() || fs.realpathSync(directory) !== directory)) throw new WorkspaceClearError('Linked runtime storage requires manual review')
    for (const record of records.filter(item => item.id === id)) {
      if (record.agentDir && path.resolve(record.agentDir) !== path.join(directory, 'agent')) throw new WorkspaceClearError('Custom agent runtime storage requires manual review')
    }
  }
  scoped(root, () => {
    for (const workflow of listWorkflows()) {
      if (listExecutions(workflow.id, 0).some(run => run.status === 'running')) throw new WorkspaceClearError('Wait for running workflows to finish before clearing Personal')
    }
  })
}

export const personalWorkspaceClear = new WorkspaceClearService({
  workspaces: () => getWorkspaceManager().loadRegistry().workspaces,
  protectedRoots: () => [os.homedir(), REPO_ROOT, stateRoot()],
  inspectRuntime: inspect,
  async prepareRuntime(root, agents) {
    const locked: string[] = []
    try {
      inspect(root, agents)
      for (const id of agents) {
        if (!beginAgentDeletion(id)) throw new WorkspaceClearError('An agent deletion is already running')
        locked.push(id)
      }
      const workflows = scoped(root, () => listWorkflows())
      const gateway = () => getGatewayClient()
      if (roster().length && roster().every(record => agents.includes(record.id))) {
        await ensureClearKeeper({
          state: stateRoot(),
          workspaceRoots: getWorkspaceManager().loadRegistry().workspaces.map(workspace => path.resolve(workspace.path)),
          readConfig: () => JSON.parse(fs.readFileSync(configPath(), 'utf8')),
          revision: async () => (await gateway().getConfig()).hash,
          create: (entry, revision) => gateway().createWorkspaceClearKeeper(entry, revision),
        })
      }
      const cronIds = new Set(workflows.flatMap(workflow => (workflow.cronJobId || '').split(',').map(value => value.trim()).filter(Boolean)))
      if (cronIds.size || agents.length) {
        const page = await gateway().call<any>('cron.list', { includeDisabled: true, limit: 200 })
        if (!Array.isArray(page?.jobs) || page.hasMore || (typeof page.total === 'number' && page.total > page.jobs.length)) throw new WorkspaceClearError('Runtime schedule inventory is incomplete; manual review required')
        for (const job of page.jobs) {
          if (cronIds.has(job.id) && !agents.includes(job.effectiveAgentId || job.agentId)) throw new WorkspaceClearError('A schedule references an agent outside Personal; manual review required')
        }
        for (const job of page.jobs) {
          if (!cronIds.has(job.id) && !agents.includes(job.effectiveAgentId || job.agentId)) continue
          if (job.state?.runningAtMs) throw new WorkspaceClearError('A runtime schedule is running; retry when it finishes')
          const result = await gateway().call<any>('cron.remove', { id: job.id })
          if (result?.removed !== true) throw new Error('Schedule removal not verified')
        }
      }
      for (const workflow of workflows) {
        unscheduleWorkflow(workflow.id)
      }
      for (const id of agents) {
        inspect(root, agents)
        const registered = roster().some(record => record.id === id)
        if (registered) {
          await clearPinnedOpenClawWorkspaceState(path.join(root, 'AGENTS', id))
          await gateway().deleteAgentNative(id, false)
          if (roster().some(record => record.id === id)) throw new Error('Agent registration removal not verified')
        }
        // Native removal closes SQLite handles; do not delete unregistered,
        // unexplained shared state unless the live lifecycle confirms absence.
        const directory = path.join(stateRoot(), 'agents', id)
        if (fs.existsSync(directory)) {
          if (!registered) await gateway().deleteAgentNative(id, false)
          if (roster().some(record => record.id === id)) throw new Error('Agent registration reappeared')
          fs.rmSync(directory, { recursive: true, force: true })
        }
      }
      if (cronIds.size || agents.length) {
        const remaining = await gateway().call<any>('cron.list', { includeDisabled: true, limit: 200 })
        if (!Array.isArray(remaining?.jobs) || remaining.hasMore || (typeof remaining.total === 'number' && remaining.total > remaining.jobs.length)
          || remaining.jobs.some((job: any) => cronIds.has(job.id) || agents.includes(job.effectiveAgentId || job.agentId))) throw new WorkspaceClearError('Runtime schedules remain; cleanup must be retried')
      }
    } finally { for (const id of locked) finishAgentDeletion(id) }
  },
  finishRuntime() { /* Owned local schedules were stopped before file removal. */ },
})
