/** Explicit opt-in acceptance. Pass a prepared OpenClaw binary; never an
 * installed instance profile. Owns a temporary state/config root and one child
 * process group. Does not load provider keys or make Agent/model calls.
 */
import assert from 'assert'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import net from 'net'
import { spawn, execFile } from 'child_process'
import { promisify } from 'util'
import { setTimeout as delay } from 'timers/promises'
import { templateFixture } from '../server/lib/portable-template.test'
import { validatePortableTemplate } from '../server/lib/portable-template'
import { InstanceTemplateCatalog, writeAtomicJson } from '../server/lib/instance-template-catalog'
import { createTemplateResourceFileCompiler } from '../server/lib/template-resource-files'
import { TemplateRevisionStore } from '../server/lib/template-revisions'
import { createTemplateGatewayTransport, TemplateGatewayTransaction } from '../server/lib/template-gateway-transaction'
import { TemplateApplyCoordinator } from '../server/lib/template-apply-coordinator'
import { recoverTemplatesBeforeStartup } from '../server/lib/template-startup-recovery'
import { buildTemplateAgentEntriesPatch } from '../server/lib/gateway-rpc'

async function main() {
  const binary = process.argv[2]
  assert(binary && path.isAbsolute(binary) && fs.existsSync(binary), 'Pass an absolute prepared OpenClaw binary path')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-isolated-template-gateway-'))
  const workspace = path.join(root, 'workspace')
  const state = path.join(root, 'state')
  const configFile = path.join(state, 'openclaw.json')
  const token = crypto.randomBytes(32).toString('hex')
  const listener = net.createServer()
  await new Promise<void>((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve) })
  const port = (listener.address() as net.AddressInfo).port
  await new Promise<void>(resolve => listener.close(() => resolve()))
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH, TMPDIR: root, NODE_ENV: 'test',
    OPENCLAW_STATE_DIR: state, OPENCLAW_CONFIG_PATH: configFile,
    OPENCLAW_GATEWAY_TOKEN: token, OPENCLAW_SKIP_CHANNELS: '1',
    OPENCLAW_NO_RESPAWN: '1', OPENCLAW_DISABLE_BONJOUR: '1',
  }
  writeAtomicJson(configFile, {
    logging: { file: path.join(root, 'gateway.log') },
    plugins: { enabled: false },
    gateway: { mode: 'local', port, bind: 'loopback', auth: { mode: 'token', token }, controlUi: { enabled: false } },
    browser: { enabled: false }, cron: { enabled: false },
    agents: { ownership: 'explicit', entries: { baseline: {
      name: 'Unrelated acceptance fixture', workspace: path.join(root, 'baseline'),
      agentDir: path.join(state, 'agents/baseline/agent'), model: 'openai/gpt-4.1-mini',
      skills: [], tools: { deny: ['*'] }, heartbeat: { every: '0m' },
    } } },
  })
  const child = spawn(binary, ['gateway', 'run', '--port', String(port), '--bind', 'loopback'], { cwd: root, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let logs = ''
  const collect = (chunk: Buffer) => { logs = (logs + chunk.toString()).slice(-12000) }
  child.stdout?.on('data', collect); child.stderr?.on('data', collect)
  let spawnError: Error | undefined
  child.on('error', error => { spawnError = error })
  const closed = new Promise<void>(resolve => child.once('close', () => resolve()))
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    if (child.pid) { try { process.kill(-child.pid, 'SIGTERM') } catch { /* already exited */ } }
  }, 180000)
  const rpc = async (method: string, params?: unknown) => {
    try {
      // The child reads ONLY the pinned test config/state root. Omitting --url
      // uses its paired local CLI identity instead of the explicit-URL auth path.
      const { stdout } = await promisify(execFile)(binary, ['gateway', 'call', method, '--json', '--timeout', '10000', ...(params ? ['--params', JSON.stringify(params)] : [])], { cwd: root, env, timeout: 20000, maxBuffer: 2 * 1024 * 1024 })
      return JSON.parse(stdout.slice(stdout.indexOf('{')))
    } catch (error: any) {
      throw new Error(`Isolated ${method} failed (${error.code || error.signal || 'unknown'}): ${String(error.stderr || error.stdout || error.message).slice(-4000)}`)
    }
  }
  const readConfig = async () => {
    const deadline = Date.now() + 30000
    while (true) {
      try { return await rpc('config.get') } catch (error) {
        if (Date.now() >= deadline || child.exitCode !== null || child.signalCode !== null || timedOut || spawnError) throw error
        await delay(1000)
      }
    }
  }
  try {
    const deadline = Date.now() + 60000
    while (true) {
      if (spawnError) throw spawnError
      if (child.exitCode !== null || child.signalCode !== null || timedOut) throw new Error('Isolated gateway exited during startup')
      try { if ((await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) })).ok) break } catch { /* bounded startup probe */ }
      if (Date.now() >= deadline) throw new Error('Isolated gateway startup timed out')
      await delay(1000)
    }
    const transport = createTemplateGatewayTransport({
      getConfig: async () => {
        const value = await readConfig()
        assert.equal((value.sourceConfig || value.config)?.gateway?.port, port, 'RPC must target the isolated gateway')
        return value
      },
      patchTemplateAgentEntriesAtRevision: async (entries, baseHash) => { await rpc('config.patch', buildTemplateAgentEntriesPatch(entries, baseHash)) },
    })
    const before = await transport.snapshot()
    assert.deepEqual(Object.keys(before.entries), ['baseline'])
    const bytes = await templateFixture()
    const bundle = await validatePortableTemplate(bytes)
    const template = new InstanceTemplateCatalog(workspace, 'isolated').import(bundle, bytes, 'actor', 'import').template
    const platform = `${process.platform}/${process.arch === 'x64' ? 'amd64' : process.arch}`
    const runtime = { platform, revision: 'isolated-openclaw' }
    const registry = {
      apiVersion: 'clawmax.template-authority/v1alpha1', workspaceId: 'isolated', revision: 'v1',
      bindings: bundle.artifacts.filter(item => item.kind === 'agent').map(agent => ({
        id: `${agent.id}-binding`, revision: 'v1', artifactId: agent.id, artifactDigest: agent.digest,
        actorIds: ['actor'], disabled: false, model: { id: 'openai/gpt-4.1-mini', revision: 'v1' },
        policy: { id: 'no-tools', sha256: 'a'.repeat(64) }, runtime, skills: [], credentials: [],
      })),
    }
    const store = new TemplateRevisionStore(workspace, 'isolated', createTemplateResourceFileCompiler(workspace, { read: () => registry, runtime }))
    const gateway = new TemplateGatewayTransaction(workspace, transport)
    const coordinator = new TemplateApplyCoordinator(store, gateway, path.join(state, 'agents'))
    const request = { templateId: template.id, expectedRevision: null, idempotencyKey: 'apply', bindings: { producer: 'producer-binding', reviewer: 'reviewer-binding' } }
    const plan = await store.plan('actor', request)
    const result = await coordinator.apply('actor', request, plan.planDigest)
    assert(result.created)
    assert(!(await coordinator.apply('actor', request, plan.planDigest)).created)
    const after = await transport.snapshot()
    assert.equal(Object.keys(after.entries).length, 3)
    assert.deepEqual(after.entries.baseline, before.entries.baseline)
    assert(fs.existsSync(path.join(workspace, 'AGENTS', result.revision.resources.agents.producer, 'IDENTITY.md')))
    assert.equal(await coordinator.recover(), 'none')
    // Recreate the durable committed checkpoint left if the process exits before
    // removing its gateway journal. This is journal replay, not a crash test.
    const owned = Object.fromEntries(Object.values(result.revision.resources.agents).map(id => [id, after.entries[id]]))
    writeAtomicJson(path.join(workspace, '.clawmax/template-gateway-transaction.json'), { version: 1, planDigest: plan.planDigest, entries: owned })
    await recoverTemplatesBeforeStartup([{ id: 'isolated', path: workspace }], transport, path.join(state, 'agents'))
    assert.deepEqual((await transport.snapshot()).entries, after.entries, 'Committed recovery must preserve all native registrations')
    assert(!fs.existsSync(path.join(workspace, '.clawmax/template-gateway-transaction.json')))

    const orphanWorkspace = path.join(root, 'uncommitted-workspace')
    const orphanId = 'tr-bbbbbbbbbbbbbbbb-agent-bbbbbbbbbbbb'
    const secondOrphanId = 'tr-bbbbbbbbbbbbbbbb-agent-cccccccccccc'
    const orphanEntry = (id: string) => ({
      name: 'Uncommitted recovery fixture', workspace: path.join(orphanWorkspace, 'AGENTS', id),
      agentDir: path.join(state, 'agents', id, 'agent'), model: 'openai/gpt-4.1-mini',
      skills: [], tools: { deny: ['*'] }, heartbeat: { every: '0m' },
    })
    const beforeOrphans = await transport.snapshot()
    await new TemplateGatewayTransaction(orphanWorkspace, transport).register('b'.repeat(64), {
      [orphanId]: orphanEntry(orphanId), [secondOrphanId]: orphanEntry(secondOrphanId),
    })
    assert(Object.hasOwn((await transport.snapshot()).entries, orphanId))
    await assert.rejects(transport.patch({ [orphanId]: null, [secondOrphanId]: null }, beforeOrphans.hash), 'Stale revisions must not delete Agents')
    assert(Object.hasOwn((await transport.snapshot()).entries, secondOrphanId))
    const lostResponseTransport = {
      snapshot: transport.snapshot,
      async patch(entries: Parameters<typeof transport.patch>[0], hash: string) {
        await transport.patch(entries, hash)
        throw new Error('Synthetic lost rollback response after native commit')
      },
    }
    await assert.rejects(recoverTemplatesBeforeStartup([{ id: 'uncommitted', path: orphanWorkspace }], lostResponseTransport, path.join(state, 'agents')), /rollback requires recovery/)
    assert(fs.existsSync(path.join(orphanWorkspace, '.clawmax/template-gateway-transaction.json')))
    assert.deepEqual((await transport.snapshot()).entries, after.entries, 'Native batch rollback must preserve all unrelated registrations')
    await recoverTemplatesBeforeStartup([{ id: 'uncommitted', path: orphanWorkspace }], transport, path.join(state, 'agents'))
    assert.deepEqual((await transport.snapshot()).entries, after.entries, 'Rollback must remove only the uncommitted native registration')
    assert(!fs.existsSync(path.join(orphanWorkspace, '.clawmax/template-gateway-transaction.json')))
    const cleanupPlan = store.planCleanup('actor', result.revision.id, store.currentRevision(), () => {})
    assert.deepEqual((await transport.snapshot()).entries, after.entries, 'Cleanup planning must not modify registrations')
    // Catalog deletion is separate from revision cleanup and never cascades.
    new InstanceTemplateCatalog(workspace, 'isolated').remove(template.id)
    const cleaned = await coordinator.cleanup('actor', result.revision.id, cleanupPlan.expectedRevision, cleanupPlan.planDigest, () => {})
    assert(cleaned.removed)
    assert.deepEqual((await transport.snapshot()).entries, before.entries, 'Committed cleanup must preserve exactly the unrelated baseline')
    assert(!fs.existsSync(path.join(workspace, 'AGENTS', result.revision.resources.agents.producer, 'IDENTITY.md')))
    assert(store.history()[0].cleanedAt, 'Keep revision evidence after native cleanup')
    assert(!(await coordinator.cleanup('actor', result.revision.id, cleanupPlan.expectedRevision, cleanupPlan.planDigest, () => { throw new Error('Unexpected stopped check on cleaned retry') })).removed)
    console.log('Isolated real OpenClaw gateway: staging, replay, committed journal recovery, two-Agent rollback, stale-revision rejection, lost-response retry, non-mutating cleanup planning, exact committed cleanup after catalog removal, cleanup replay, and unrelated roster preservation passed; no model calls; no process-crash claim')
  } catch (error: any) {
    const safe = `${error.message}\n${logs}`.split(token).join('[test-token-redacted]')
    throw new Error(safe)
  } finally {
    clearTimeout(timeout)
    // Only the process group spawned by this harness; never gateway stop/restart.
    if (child.pid) {
      try { process.kill(-child.pid, 'SIGTERM') } catch { /* already exited */ }
      await Promise.race([closed, delay(5000)])
      try { process.kill(-child.pid, 'SIGKILL') } catch { /* already exited */ }
      await closed
    }
    fs.rmSync(root, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
