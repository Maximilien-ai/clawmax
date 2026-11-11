import assert from 'assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-channel-routing-'))
  const savedEnv = { HOME: process.env.HOME, OPENCLAW_WORKSPACE: process.env.OPENCLAW_WORKSPACE, CLAWMAX_TEST_WORKSPACE: process.env.CLAWMAX_TEST_WORKSPACE }
  process.env.HOME = root
  process.env.OPENCLAW_WORKSPACE = path.join(root, 'initial')
  delete process.env.CLAWMAX_TEST_WORKSPACE
  const { getWorkspaceManager, resetWorkspaceManagerForTests } = require('../lib/workspace-manager')
  resetWorkspaceManagerForTests()
  const manager = getWorkspaceManager()
  const a = manager.createWorkspace('Alpha', path.join(root, 'alpha'))
  const b = manager.createWorkspace('Beta', path.join(root, 'beta'))
  const workspace = require('../lib/workspace')
  const runtime = require('../lib/agent-runtime')
  const execution = require('../lib/agent-execution')
  const opik = require('../lib/opik')
  const original = { list: workspace.listAgents, execute: runtime.executeAgentRuntimeTurn, resolve: execution.resolveAgentExecutionConfig, trace: opik.traceAgentChat }
  const rows: Array<{ agent: string; workspace: string; session: string; message: string }> = []
  let release: (() => void) | undefined
  let started!: () => void
  const startedGate = new Promise<void>(resolve => { started = resolve })
  let revokedStarted!: () => void
  const revokedGate = new Promise<void>(resolve => { revokedStarted = resolve })
  let releaseRevoked: (() => void) | undefined
  let releaseLock: (() => void) | undefined
  const catalog = (target: string, members = 'analyst, reviewer') => {
    fs.writeFileSync(path.join(target, 'ORG', 'GROUPS.md'), '# Groups\n\n## Groups\n\n### alpha\n\n- **Members:** analyst\n\n### beta\n\n- **Members:** reviewer\n')
    fs.writeFileSync(path.join(target, 'ORG', 'COMMUNITIES.md'), `# Communities\n\n## Communities\n\n### alpha\n\n- **Members:** analyst, reviewer\n\n### queued\n\n- **Members:** ${members}\n`)
  }
  for (const target of [a.path, b.path]) {
    catalog(target)
    for (const id of ['analyst', 'reviewer', 'outsider']) {
      fs.mkdirSync(path.join(target, 'AGENTS', id), { recursive: true })
      fs.writeFileSync(path.join(target, 'AGENTS', id, 'IDENTITY.md'), `# Identity\n\n- **Name:** ${id}\n`)
    }
  }
  workspace.listAgents = () => ['analyst', 'reviewer', 'outsider'].map(id => ({ id, archived: false }))
  execution.resolveAgentExecutionConfig = (id: string) => ({ runtime: 'droid', provider: 'openai', model: 'openai/gpt-5.4-mini', workspace: path.join(workspace.getWorkspacePath(), 'AGENTS', id) })
  opik.traceAgentChat = () => undefined
  runtime.executeAgentRuntimeTurn = async (args: any) => {
    rows.push({ agent: args.agentId, workspace: args.env.OPENCLAW_WORKSPACE, session: args.scopedSessionId, message: args.message })
    if (args.message.endsWith('A_ONLY')) await new Promise<void>(resolve => { release = resolve; started() })
    if (args.message.endsWith('LOCK_HELD')) await new Promise<void>(resolve => { releaseLock = resolve })
    if (args.message.endsWith('REVOKED_ONLY') && args.agentId === 'analyst') await new Promise<void>(resolve => { releaseRevoked = resolve; revokedStarted() })
    return { text: `REPLY:${args.agentId}:${args.message.split('\n').at(-1)}`, errorText: '', missingCliError: undefined }
  }
  const router = require('./channels').default
  const storage = require('../lib/messages')
  function response() {
    return { statusCode: 200, body: undefined as any, status(code: number) { this.statusCode = code; return this }, json(body: any) { this.body = body; return this } }
  }
  async function send(type: string, name: string, content: string, mentions: unknown) {
    const route = router.stack.find((entry: any) => entry.route?.path === `/${type}/:name/messages` && entry.route.methods.post).route.stack.at(-1).handle
    const result = response()
    await route({ params: { name }, body: { content, mentions }, headers: {} }, result, (error: Error) => { throw error })
    return result
  }
  const history = (which: any, type: string, name: string) => manager.withWorkspace(which.id, () => storage.getMessages(type, name).map((message: any) => message.content))
  async function until(check: () => Promise<boolean>) {
    const deadline = Date.now() + 10000
    while (!(await check())) {
      assert(Date.now() < deadline, 'Synthetic routing did not settle')
      await new Promise(resolve => setTimeout(resolve, 10))
    }
  }
  let scenarios = 0
  try {
    manager.setActiveWorkspace(a.id)
    for (const [type, name, mentions, status] of [
      ['groups', 'alpha', ['reviewer'], 403],
      ['groups', 'alpha', ['analyst', 'outsider'], 403],
      ['communities', 'alpha', ['outsider'], 403],
      ['groups', 'missing', ['analyst'], 404],
      ['groups', 'alpha', 'analyst', 400],
      ['groups', 'alpha', ['../analyst'], 400],
      ['groups', 'alpha', { 0: 'analyst', length: 1000000000000 }, 400],
      ['communities', 'alpha', { 0: 'analyst', length: 1000000000000 }, 400],
    ] as const) {
      const result = await send(type, name, 'DENIED_ONLY', mentions)
      assert.equal(result.statusCode, status)
      assert.equal(rows.length, 0, 'rejected recipients must never execute')
    }
    assert.deepEqual(await history(a, 'group', 'alpha'), [], 'invalid recipients cannot persist a partial message')
    scenarios++

    assert.equal((await send('groups', 'alpha', 'A_ONLY', ['analyst', 'analyst'])).statusCode, 200)
    await until(async () => rows.some(row => row.message.endsWith('A_ONLY')))
    await startedGate
    manager.setActiveWorkspace(b.id)
    assert.equal((await send('groups', 'alpha', 'B_ONLY', ['analyst'])).statusCode, 200)
    release!()
    await until(async () => (await history(a, 'group', 'alpha')).length === 2 && (await history(b, 'group', 'alpha')).length === 2)
    assert.deepEqual(await history(a, 'group', 'alpha'), ['A_ONLY', 'REPLY:analyst:A_ONLY'])
    assert.deepEqual(await history(b, 'group', 'alpha'), ['B_ONLY', 'REPLY:analyst:B_ONLY'])
    assert.equal(rows.filter(row => row.message.endsWith('A_ONLY')).length, 1, 'duplicate mentions dispatch once')
    assert.equal(rows[0].workspace, a.path)
    assert.equal(rows[1].workspace, b.path)
    assert.notEqual(rows[0].session, rows[1].session, 'same group/agent in different workspaces needs separate runtime sessions')
    scenarios++

    manager.setActiveWorkspace(a.id)
    assert.equal((await send('groups', 'beta', 'BETA_GROUP', ['reviewer'])).statusCode, 200)
    await until(async () => (await history(a, 'group', 'beta')).length === 2)
    assert.equal((await send('communities', 'alpha', 'COMMUNITY_ONLY', ['analyst', 'reviewer'])).statusCode, 200)
    await until(async () => (await history(a, 'community', 'alpha')).length === 3)
    assert.deepEqual(await history(a, 'group', 'alpha'), ['A_ONLY', 'REPLY:analyst:A_ONLY'])
    assert.deepEqual(await history(a, 'group', 'beta'), ['BETA_GROUP', 'REPLY:reviewer:BETA_GROUP'])
    assert.deepEqual(await history(a, 'community', 'alpha'), ['COMMUNITY_ONLY', 'REPLY:analyst:COMMUNITY_ONLY', 'REPLY:reviewer:COMMUNITY_ONLY'])
    const groupSession = rows.find(row => row.message.endsWith('A_ONLY'))!.session
    const communitySession = rows.find(row => row.message.endsWith('COMMUNITY_ONLY'))!.session
    assert.notEqual(groupSession, communitySession, 'same-named group/community must not share runtime context')
    scenarios++

    assert.equal((await send('communities', 'queued', 'REVOKED_ONLY', ['analyst', 'reviewer'])).statusCode, 200)
    await until(async () => rows.some(row => row.message.endsWith('REVOKED_ONLY')))
    await revokedGate
    catalog(a.path, 'analyst')
    releaseRevoked!()
    await until(async () => (await history(a, 'community', 'queued')).length === 3)
    assert.equal(rows.filter(row => row.message.endsWith('REVOKED_ONLY')).length, 1, 'a removed member must not receive queued work')
    assert((await history(a, 'community', 'queued')).at(-1).includes('no longer an active member'))
    scenarios++

    assert.equal((await send('groups', 'alpha', 'LOCK_HELD', ['analyst'])).statusCode, 200)
    await until(async () => rows.some(row => row.message.endsWith('LOCK_HELD')))
    assert.equal((await send('communities', 'queued', 'LOCK_REVOKED', ['analyst'])).statusCode, 200)
    catalog(a.path, '')
    releaseLock!()
    await until(async () => (await history(a, 'community', 'queued')).length === 5)
    assert.equal(rows.filter(row => row.message.endsWith('LOCK_REVOKED')).length, 0, 'authorization is rechecked after the agent lock releases')
    scenarios++

    const temporary = `bulk-chat-${Date.now()}`
    assert.equal((await send('groups', temporary, 'TEMPORARY_ONLY', ['reviewer'])).statusCode, 200)
    await until(async () => (await history(a, 'group', temporary)).length === 2)
    assert.deepEqual(await history(a, 'group', 'beta'), ['BETA_GROUP', 'REPLY:reviewer:BETA_GROUP'])
    scenarios++
    manager.setActiveWorkspace(b.id)
    const beforeBeta = await history(b, 'group', 'alpha')
    await manager.withWorkspace(a.id, async () => {
      manager.deleteWorkspace(a.id)
      assert.throws(() => workspace.getWorkspacePath(), /Workspace not found/, 'a removed pinned workspace must never become the active/default workspace')
      assert.throws(() => storage.addMessage('group', 'alpha', { from: 'analyst', content: 'MUST_NOT_REHOME', mentions: [] }), /Workspace not found/)
    })
    assert.deepEqual(await history(b, 'group', 'alpha'), beforeBeta, 'removal cannot redirect a pending reply to another workspace')
    scenarios++

    console.log(`Channel routing isolation: ${scenarios} scenarios passed (recipient admission, deduplication, scoped sessions/replies, community dispatch, revocation, temporary chat)`)
  } finally {
    release?.(); releaseRevoked?.(); releaseLock?.()
    workspace.listAgents = original.list
    runtime.executeAgentRuntimeTurn = original.execute
    execution.resolveAgentExecutionConfig = original.resolve
    opik.traceAgentChat = original.trace
    resetWorkspaceManagerForTests()
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    fs.rmSync(root, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
