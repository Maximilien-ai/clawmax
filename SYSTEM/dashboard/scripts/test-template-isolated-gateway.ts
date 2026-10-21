/** Explicit opt-in acceptance. Pass a prepared OpenClaw binary; never an
 * installed instance profile. Owns a temporary state/config root and one child
 * process group. Optional --local-model ollama/<id> enables credential-free
 * native execution against localhost Ollama. Never loads hosted provider keys.
 * CLAWMAX_ACCEPTANCE_CLI_CHECKOUT optionally runs the actual Go HTTP client
 * from an explicit CLI checkout without touching profiles or the OS keychain.
 */
import assert from 'assert'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import net from 'net'
import http from 'http'
import express from 'express'
import { spawn, execFile } from 'child_process'
import { promisify } from 'util'
import { setTimeout as delay } from 'timers/promises'
import { templateFixture } from '../server/lib/portable-template.test'
import { sha256, validatePortableTemplate } from '../server/lib/portable-template'
import { InstanceTemplateCatalog, writeAtomicJson } from '../server/lib/instance-template-catalog'
import { createTemplateResourceFileCompiler } from '../server/lib/template-resource-files'
import { TemplateRevisionStore } from '../server/lib/template-revisions'
import { createTemplateGatewayTransport, TemplateGatewayTransaction } from '../server/lib/template-gateway-transaction'
import { TemplateApplyCoordinator } from '../server/lib/template-apply-coordinator'
import { recoverTemplatesBeforeStartup } from '../server/lib/template-startup-recovery'
import { buildTemplateAgentEntriesPatch, GatewayRPCClient } from '../server/lib/gateway-rpc'
import { noToolsTemplatePolicy } from '../server/lib/template-execution-policy'

async function main() {
  const binary = process.argv[2]
  assert(binary && path.isAbsolute(binary) && fs.existsSync(binary), 'Pass an absolute prepared OpenClaw binary path')
  const localModel = process.argv[3] === '--local-model' ? process.argv[4] : undefined
  assert(process.argv.length === 3 || (process.argv.length === 5 && localModel && /^ollama\/[a-zA-Z0-9._:-]+$/.test(localModel)), 'Optional arguments: --local-model ollama/<id>')
  const model = localModel || 'openai/gpt-4.1-mini'
  const hostRegistry = path.join(os.homedir(), '.openclaw', 'dashboard-workspaces.json')
  const hostRegistryBefore = fs.existsSync(hostRegistry) ? fs.readFileSync(hostRegistry) : null
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
    ...(localModel ? { models: { providers: { ollama: {
      baseUrl: 'http://127.0.0.1:11434', api: 'ollama', apiKey: 'ollama-local',
      models: [{ id: localModel.slice('ollama/'.length), name: 'Isolated local acceptance', contextWindow: 32768, maxTokens: 1024 }],
    } } } } : {}),
    logging: { file: path.join(root, 'gateway.log') },
    plugins: localModel ? { enabled: true, allow: ['ollama'], entries: { ollama: { enabled: true } } } : { enabled: false },
    gateway: { mode: 'local', port, bind: 'loopback', auth: { mode: 'token', token }, controlUi: { enabled: false } },
    browser: { enabled: false }, cron: { enabled: false },
    agents: { ownership: 'explicit', entries: { baseline: {
      name: 'Unrelated acceptance fixture', workspace: path.join(root, 'baseline'),
      agentDir: path.join(state, 'agents/baseline/agent'), model,
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
  }, localModel ? 420000 : 180000)
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
        actorIds: ['actor'], disabled: false, model: { id: model, revision: 'v1' },
        policy: { id: 'no-tools', sha256: sha256(JSON.stringify(noToolsTemplatePolicy('no-tools'))) }, runtime, skills: [], credentials: [],
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
    if (localModel) {
      // Scope the Dashboard RPC client to this process's disposable gateway;
      // never consult a profile or the installed instance's URL/state.
      const previousConfig = process.env.OPENCLAW_CONFIG_PATH
      const previousUrl = process.env.OPENCLAW_GATEWAY_URL
      const previousState = process.env.OPENCLAW_STATE_DIR
      const previousBinary = process.env.OPENCLAW_BIN
      process.env.OPENCLAW_CONFIG_PATH = configFile
      // Native CLI pairing uses this config's local endpoint. An explicit URL
      // is a different auth contract and must not inherit config credentials.
      delete process.env.OPENCLAW_GATEWAY_URL
      process.env.OPENCLAW_STATE_DIR = state
      process.env.OPENCLAW_BIN = binary
      let diagnostic = ''
      try {
        const client = new GatewayRPCClient()
        // Capture only isolated transport failure/shape diagnostics; the
        // production adapter intentionally sanitizes errors for its callers.
        const callRpc = (client as any).callRpc.bind(client)
        ;(client as any).callRpc = async (...args: unknown[]) => {
          try {
            const reply = await callRpc(...args)
            diagnostic = JSON.stringify({ status: reply?.status, resultKeys: Object.keys(reply?.result || {}), payloadCount: reply?.result?.payloads?.length })
            return reply
          } catch (error: any) { diagnostic = String(error.message); throw error }
        }
        const source = { read: () => registry, runtime }
        const policies = { read: (id: string) => noToolsTemplatePolicy(id) }
        const input = { agentId: result.revision.resources.agents.producer, message: 'Reply with a short greeting. Do not use tools.', idempotencyKey: 'local-model-greeting' }
        const reply = await coordinator.executeNoToolsAgent('actor', result.revision.id, input, source, policies, client)
        assert(reply.text.trim() && !reply.replayed)
        const replay = await coordinator.executeNoToolsAgent('actor', result.revision.id, input, source, policies, {
          runNoToolsTemplateAgent: async () => { throw new Error('Replay must not dispatch another model call') },
        })
        assert.deepEqual(replay, { ...reply, replayed: true })
        console.log(`Native no-tools execution passed: model=${model}; replyBytes=${Buffer.byteLength(reply.text)}; durable replay passed`)
        const { createInstanceCliRouter } = await import('../server/routes/instance-cli')
        const { WorkspaceManager } = await import('../server/lib/workspace-manager')
        const { createCliSessionToken } = await import('../server/lib/github-auth')
        const { createConfiguredTemplateResolver } = await import('../server/lib/template-service')
        const app = express()
        const isolatedEnv: Record<string, string> = {
          JWT_SECRET: crypto.randomBytes(32).toString('hex'),
          DASHBOARD_TOKEN: crypto.randomBytes(32).toString('hex'),
          BYPASS_OAUTH: 'false', DASHBOARD_AUTH_DISABLED: 'false', DASHBOARD_AUTH_MODE: 'email_otp',
          CLAWMAX_CLI_API_STATE_PATH: path.join(root, 'cli-api.json'), OPENCLAW_WORKSPACE: workspace,
          CLAWMAX_TEST_WORKSPACE: workspace,
        }
        const previousEnv = Object.fromEntries(Object.keys(isolatedEnv).map(key => [key, process.env[key]]))
        Object.assign(process.env, isolatedEnv)
        const registryPath = path.join(root, 'dashboard-workspaces.json')
        writeAtomicJson(registryPath, { version: '1.0.0', activeWorkspaceId: 'isolated', workspaces: [{
          id: 'isolated', name: 'Isolated acceptance', path: workspace,
          createdAt: new Date().toISOString(), lastAccessedAt: new Date().toISOString(),
        }] })
        const session = (actorId: string) => createCliSessionToken({ actorId, email: `${actorId}@example.test`, displayName: actorId })
        let authorization = `Bearer ${session('actor')}`
        let httpDispatches = 0
        const authorityDirectory = path.join(root, 'operator-authority')
        writeAtomicJson(path.join(authorityDirectory, `${sha256('isolated')}.json`), registry)
        const templates = createConfiguredTemplateResolver({ authorityDirectory, agentStateRoot: path.join(state, 'agents'), runtime,
          client: { getConfig: () => client.getConfig(), patchTemplateAgentEntriesAtRevision: (entries, hash) => client.patchTemplateAgentEntriesAtRevision(entries, hash),
            runNoToolsTemplateAgent: async request => { httpDispatches++; return client.runNoToolsTemplateAgent(request) } } })
        app.use(express.json())
        app.use('/api/cli/v1', createInstanceCliRouter({
          workspaceManager: new WorkspaceManager(registryPath),
          templates,
        }))
        const server = http.createServer(app)
        try {
          await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
          const address = server.address() as net.AddressInfo
          const origin = `http://127.0.0.1:${address.port}`
          // Seed only the browser identity; the execution bearer must come from
          // the real one-time authorization-code/PKCE exchange, with bypass off.
          const verifier = crypto.randomBytes(48).toString('base64url')
          const loginState = crypto.randomUUID()
          const redirectUri = `${origin}/isolated-callback`
          const query = new URLSearchParams({ response_type: 'code', client_id: 'clawmax-cli',
            redirect_uri: redirectUri, code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
            code_challenge_method: 'S256', state: loginState })
          const login = await fetch(`${origin}/api/cli/v1/auth/authorize?${query}`, { headers: { authorization }, redirect: 'manual' })
          assert.equal(login.status, 302)
          const callback = new URL(login.headers.get('location')!)
          await login.text()
          assert.equal(callback.searchParams.get('state'), loginState)
          assert.equal(callback.origin, origin)
          const exchange = () => fetch(`${origin}/api/cli/v1/auth/token`, { method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ grantType: 'authorization_code', clientId: 'clawmax-cli', code: callback.searchParams.get('code'), redirectUri, codeVerifier: verifier }) })
          const exchanged = await exchange()
          assert.equal(exchanged.status, 200)
          const tokenSession = await exchanged.json() as { kind: string; actorId: string; accessToken: string }
          assert.equal(tokenSession.kind, 'TokenSession')
          assert.equal(tokenSession.actorId, 'actor')
          assert(tokenSession.accessToken)
          authorization = `Bearer ${tokenSession.accessToken}`
          const reusedCode = await exchange()
          assert.equal(reusedCode.status, 400)
          await reusedCode.text()
          const url = `http://127.0.0.1:${address.port}/api/cli/v1/workspaces/isolated/agents/${input.agentId}/chat/sessions`
          const send = (credential = authorization, target = url) => fetch(target, { method: 'POST', headers: { authorization: credential, 'content-type': 'application/json' },
            body: JSON.stringify({ apiVersion: 'clawmax.instance/v1', kind: 'AgentChatRequest', message: input.message, idempotencyKey: 'http-model-greeting' }),
            signal: AbortSignal.timeout(180000) })
          for (const credential of ['', 'Bearer invalid', `${authorization}invalid`]) {
            const denied = await send(credential)
            assert.equal(denied.status, 401)
            await denied.text()
          }
          const wrongWorkspace = await send(authorization, url.replace('/workspaces/isolated/', '/workspaces/unknown/'))
          assert.equal(wrongWorkspace.status, 403)
          await wrongWorkspace.text()
          const wrongActor = await send(`Bearer ${session('unrelated')}`)
          assert.equal(wrongActor.status, 404)
          await wrongActor.text()
          assert.equal(httpDispatches, 0)
          const response = await send()
          assert.equal(response.status, 200)
          assert(response.headers.get('content-type')?.startsWith('application/x-ndjson'))
          const text = await response.text()
          const events = text.trim().split('\n').map(line => JSON.parse(line))
          assert.deepEqual(events.map(event => event.type), ['start', 'delta', 'done'])
          assert(events[1].content.trim())
          events.forEach((event, index) => {
            assert.equal(event.sequence, index + 1)
            assert.equal(event.requestId, events[0].requestId)
            assert.equal(event.sessionId, events[0].sessionId)
            assert.equal(event.workspaceId, 'isolated')
            assert.equal(event.agentId, input.agentId)
          })
          assert.equal(await (await send()).text(), text)
          assert.equal(httpDispatches, 1)
          console.log(`PKCE-authenticated public CLI router native execution passed: model=${model}; replyBytes=${Buffer.byteLength(events[1].content)}; code reuse, invalid sessions, wrong workspace/actor rejected; correlated events and durable replay passed`)
          const cliCheckout = process.env.CLAWMAX_ACCEPTANCE_CLI_CHECKOUT
          if (cliCheckout) {
            assert(path.isAbsolute(cliCheckout) && fs.existsSync(path.join(cliCheckout, 'go.mod')), 'CLI checkout must be an absolute module directory')
            await new Promise<void>((resolve, reject) => {
              const go = execFile('go', ['run', path.resolve(__dirname, 'fixtures/native-chat-cli-contract.go')], {
                cwd: cliCheckout, timeout: 210000, maxBuffer: 65536,
                env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: root, GOFLAGS: '-mod=readonly' },
              }, (error, stdout) => {
                if (error) { reject(new Error('Isolated CLI Go client acceptance failed')); return }
                if (stdout.trim() !== 'CLI Go client: native reply and durable replay passed') { reject(new Error('Unexpected isolated CLI result')); return }
                console.log(stdout.trim())
                resolve()
              })
              go.stdin!.on('error', () => reject(new Error('Isolated CLI input failed')))
              go.stdin!.end(JSON.stringify({ Origin: origin, Token: tokenSession.accessToken, Workspace: 'isolated', Agent: input.agentId }))
            })
            assert.equal(httpDispatches, 6, 'One HTTP agent call, one Go agent call and four Group turns; replays must not dispatch')
          }
          const groupId = Object.values(result.revision.resources.groups)[0]
          const groupInput = { groupId, message: 'Reply with one short sentence. Do not use tools.', idempotencyKey: 'native-group-handoff' }
          const handoffs: Array<{ agentId: string; message: string }> = []
          const groupRun = await coordinator.executeNoToolsGroup('actor', result.revision.id, groupInput, source, policies, {
            runNoToolsTemplateAgent: async request => { handoffs.push(request); return client.runNoToolsTemplateAgent(request) },
          })
          const groupResult = JSON.parse(groupRun.text)
          assert.equal(groupResult.stopReason, 'turn_limit')
          assert.deepEqual(groupResult.turns.map((turn: any) => turn.memberId), ['producer', 'reviewer', 'producer', 'reviewer'])
          assert.equal(new Set(handoffs.map(turn => turn.agentId)).size, 2)
          for (let index = 1; index < handoffs.length; index++) {
            assert.equal(JSON.parse(handoffs[index].message).content, groupResult.turns[index - 1].text)
            assert(groupResult.turns[index].text.trim())
          }
          assert.deepEqual(await coordinator.executeNoToolsGroup('actor', result.revision.id, groupInput, source, policies, {
            runNoToolsTemplateAgent: async () => { throw new Error('Group replay must not execute') },
          }), { ...groupRun, replayed: true })
          console.log('Native Group communication passed: two agents, four edge-directed turns, exact reply handoffs, turn-limit stop and durable replay')
        } finally {
          server.closeAllConnections()
          await new Promise<void>(resolve => server.close(() => resolve()))
          for (const [key, value] of Object.entries(previousEnv)) {
            if (value === undefined) delete process.env[key]
            else process.env[key] = value
          }
        }
      } catch (error: any) {
        const cause = error.cause
        throw new Error(`${error.message}; isolated transport: ${diagnostic}; isolated cause: ${String(cause?.stderr || cause?.stdout || cause?.message || '').slice(-3000)}`)
      } finally {
        if (previousConfig === undefined) delete process.env.OPENCLAW_CONFIG_PATH
        else process.env.OPENCLAW_CONFIG_PATH = previousConfig
        if (previousUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL
        else process.env.OPENCLAW_GATEWAY_URL = previousUrl
        if (previousState === undefined) delete process.env.OPENCLAW_STATE_DIR
        else process.env.OPENCLAW_STATE_DIR = previousState
        if (previousBinary === undefined) delete process.env.OPENCLAW_BIN
        else process.env.OPENCLAW_BIN = previousBinary
      }
    }
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
    console.log(`Isolated real OpenClaw gateway: staging, replay, committed journal recovery, two-Agent rollback, stale-revision rejection, lost-response retry, non-mutating cleanup planning, exact committed cleanup after catalog removal, cleanup replay, and unrelated roster preservation passed; ${localModel ? 'native local-model call and reply replay passed' : 'no model calls'}; no process-crash claim`)
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
    const hostRegistryAfter = fs.existsSync(hostRegistry) ? fs.readFileSync(hostRegistry) : null
    assert(hostRegistryBefore === null ? hostRegistryAfter === null : hostRegistryAfter !== null && hostRegistryBefore.equals(hostRegistryAfter),
      'Native acceptance must not change the host workspace registry')
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
