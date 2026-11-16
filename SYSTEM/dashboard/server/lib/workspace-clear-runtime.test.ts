import assert from 'assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { EventEmitter } from 'events'

async function main() {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'personal-clear-runtime-')))
  const root = path.join(base, 'workspace'), state = path.join(base, '.openclaw')
  const saved = { ...process.env }
  Object.assign(process.env, { HOME: base, OPENCLAW_WORKSPACE: root, OPENCLAW_STATE_DIR: state, OPENCLAW_CONFIG_PATH: path.join(state, 'openclaw.json'), CLAWMAX_WORKSPACE_REGISTRY_PATH: path.join(state, 'dashboard-workspaces.json') })
  try {
    fs.mkdirSync(path.join(root, 'AGENTS', 'sample'), { recursive: true })
    fs.mkdirSync(path.join(state, 'agents', 'sample', 'agent'), { recursive: true })
    fs.writeFileSync(path.join(root, 'AGENTS', 'sample', 'IDENTITY.md'), '**Name:** Sample\n')
    const keeper = { workspace: path.join(base, 'runtime-only') }
    const config = { agents: { ownership: 'explicit', entries: { main: keeper, sample: { workspace: path.join(root, 'AGENTS', 'sample'), agentDir: path.join(state, 'agents', 'sample', 'agent') } } }, syntheticCredential: 'preserve' }
    fs.writeFileSync(process.env.OPENCLAW_CONFIG_PATH!, JSON.stringify(config))
    const manager = require('./workspace-manager')
    manager.resetWorkspaceManagerForTests()
    manager.getWorkspaceManager().loadRegistry()
    const scheduler = require('./scheduler')
    scheduler.getSchedulerDiagnostics = () => ({ status: 'idle' })
    scheduler.unscheduleWorkflow = () => {}
    scheduler.syncAllWorkflows = () => {}
    require('./workflows').listWorkflows = () => [{ id: 'fixture-workflow', cronJobId: 'fixture-cron' }]
    require('./agent-turns').listActiveTurns = () => []
    require('./openclaw-workspace-state').clearPinnedOpenClawWorkspaceState = async () => {}
    const calls: string[] = []
    let failNative = true
    let jobs = [{ id: 'fixture-cron', effectiveAgentId: 'sample', state: {} }]
    require('./gateway-rpc').getGatewayClient = () => ({
      async getConfig() { return { hash: 'fixture-revision' } },
      async createWorkspaceClearKeeper(entry: any, revision: string) {
        assert.equal(revision, 'fixture-revision')
        calls.push('keeper.create')
        const current = JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH!, 'utf8'))
        current.agents.entries['clawmax-runtime-keeper'] = entry
        fs.writeFileSync(process.env.OPENCLAW_CONFIG_PATH!, JSON.stringify(current))
      },
      async call(method: string) {
        calls.push(method)
        if (method === 'cron.remove') { jobs = []; return { removed: true } }
        return { jobs, total: jobs.length, hasMore: false }
      },
      async deleteAgentNative(id: string, deleteFiles: boolean) {
        assert.equal(id, 'sample'); assert.equal(deleteFiles, false)
        calls.push('agents.delete')
        if (failNative) throw new Error('synthetic refusal')
        const current = JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH!, 'utf8'))
        delete current.agents.entries[id]
        fs.writeFileSync(process.env.OPENCLAW_CONFIG_PATH!, JSON.stringify(current))
      },
    })
    const { personalWorkspaceClear } = require('./workspace-clear-runtime')
    fs.writeFileSync(process.env.OPENCLAW_CONFIG_PATH!, JSON.stringify({ ...config, agents: { ...config.agents, defaults: { authInheritance: { agentId: 'sample' } } } }))
    assert.throws(() => personalWorkspaceClear.preview('owner'), /shared-credential owner/)
    fs.writeFileSync(process.env.OPENCLAW_CONFIG_PATH!, JSON.stringify({ ...config, agents: { ownership: 'explicit', entries: { sample: config.agents.entries.sample } } }))
    personalWorkspaceClear.preview('owner')
    assert(!fs.existsSync(path.join(root, '.clawmax-workspace-clear.json')))
    assert(!fs.existsSync(path.join(state, 'workspace-clear-keeper')))
    const { workspaceClearRequestGate, clearPending } = require('./workspace-clear-http')
    const gate = workspaceClearRequestGate()
    const response = () => Object.assign(new EventEmitter(), { statusCode: 200, status(code: number) { this.statusCode = code; return this }, json() { return this } })
    const writer = response()
    gate({ path: '/agents', method: 'POST' }, writer, () => {})
    const refused = response(); let reached = false
    gate({ path: '/workspaces/default/clear', method: 'POST' }, refused, () => { reached = true })
    assert.equal(refused.statusCode, 409); assert.equal(reached, false)
    writer.emit('finish'); writer.emit('close')
    let preview = personalWorkspaceClear.preview('owner')
    await assert.rejects(personalWorkspaceClear.clear('owner', { token: preview.token, confirmation: 'CLEAR PERSONAL', acknowledged: true }))
    assert(clearPending()); assert(fs.existsSync(path.join(state, 'agents', 'sample')))
    const denied = response()
    gate({ path: '/workspaces', method: 'POST' }, denied, () => { throw new Error('must block creation during recovery') })
    assert.equal(denied.statusCode, 409)
    const allowed = response(); let read = false
    gate({ path: '/workspaces/active', method: 'GET' }, allowed, () => { read = true })
    assert(read)
    failNative = false
    preview = personalWorkspaceClear.preview('owner')
    assert(preview.resume)
    await personalWorkspaceClear.clear('owner', { token: preview.token, confirmation: 'CLEAR PERSONAL', acknowledged: true })
    assert(!clearPending()); assert(!fs.existsSync(path.join(state, 'agents', 'sample')))
    assert.equal(JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH!, 'utf8')).syntheticCredential, 'preserve')
    assert.equal(manager.getWorkspaceManager().getActiveWorkspaceId(), 'default')
    assert(calls.includes('agents.delete'))
    assert(calls.includes('cron.remove'))
    assert.equal(calls.filter(call => call === 'keeper.create').length, 1)
    const remaining = JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH!, 'utf8'))
    assert.deepEqual(Object.keys(remaining.agents.entries), ['clawmax-runtime-keeper'])
    assert.deepEqual(require('./workspace').listAgents(), [])
    console.log('Personal clear runtime and HTTP admission tests passed: native failure, retry, registration/state cleanup, credentials, request fencing')
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]
    Object.assign(process.env, saved)
    fs.rmSync(base, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
