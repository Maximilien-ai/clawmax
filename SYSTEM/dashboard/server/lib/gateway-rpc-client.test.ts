import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  GatewayRPCClient,
  getConfiguredGatewayPort,
  getGatewayClient,
  isGatewayConfigured,
  shouldTreatGatewayAsRunning,
} from './gateway-rpc'

let testsPassed = 0
let testsFailed = 0

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    console.log(`✓ ${name}`)
    testsPassed++
  } catch (err: any) {
    console.error(`✗ ${name}`)
    console.error(`  ${err.message}`)
    testsFailed++
  }
}

async function withGatewayConfig(fn: (client: GatewayRPCClient) => Promise<void>) {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-gateway-rpc-client-'))
  const originalHome = process.env.HOME
  const originalGatewayUrl = process.env.OPENCLAW_GATEWAY_URL
  const configDir = path.join(tempHome, '.openclaw')
  fs.mkdirSync(configDir, { recursive: true })
  fs.writeFileSync(path.join(configDir, 'openclaw.json'), JSON.stringify({
    gateway: {
      port: 18789,
      auth: { mode: 'token', token: 'test-token' },
    },
  }))
  process.env.HOME = tempHome
  delete process.env.OPENCLAW_GATEWAY_URL

  try {
    await fn(new GatewayRPCClient())
  } finally {
    if (typeof originalHome === 'undefined') delete process.env.HOME
    else process.env.HOME = originalHome
    if (typeof originalGatewayUrl === 'undefined') delete process.env.OPENCLAW_GATEWAY_URL
    else process.env.OPENCLAW_GATEWAY_URL = originalGatewayUrl
    fs.rmSync(tempHome, { recursive: true, force: true })
  }
}

async function expectFailure(fn: () => Promise<unknown>, expected: string) {
  const originalError = console.error
  console.error = () => {}
  try {
    await assert.rejects(fn, (err: any) => String(err?.message || '').includes(expected))
  } finally {
    console.error = originalError
  }
}

async function run() {
  await test('updateAgentSkills reads the hash and submits a scoped config patch', async () => {
    await withGatewayConfig(async (client) => {
      const calls: Array<{ method: string; params?: any }> = []
      ;(client as any).call = async (method: string, params?: any) => {
        calls.push({ method, params })
        return method === 'config.get' ? { hash: 'base-hash' } : undefined
      }

      await client.updateAgentSkills('agent-1', ['github', 'notion'])

      assert.deepStrictEqual(calls.map(call => call.method), ['config.get', 'config.patch'])
      assert.strictEqual(calls[1].params.baseHash, 'base-hash')
      assert.deepStrictEqual(JSON.parse(calls[1].params.raw), {
        agents: { entries: { 'agent-1': { skills: ['github', 'notion'] } } },
      })
    })
  })

  await test('updateAgentSkills reports gateway failures with operation context', async () => {
    await withGatewayConfig(async (client) => {
      ;(client as any).call = async () => { throw new Error('gateway offline') }
      await expectFailure(() => client.updateAgentSkills('agent-1', []), 'Failed to update skills via gateway: gateway offline')
    })
  })

  await test('patchConfig serializes patches and wraps gateway errors', async () => {
    await withGatewayConfig(async (client) => {
      let received: any
      ;(client as any).call = async (method: string, params: any) => {
        received = { method, params }
      }
      await client.patchConfig({ gateway: { mode: 'local' } })
      assert.strictEqual(received.method, 'config.patch')
      assert.deepStrictEqual(JSON.parse(received.params.raw), { gateway: { mode: 'local' } })

      ;(client as any).call = async () => { throw new Error('invalid patch') }
      await expectFailure(() => client.patchConfig({}), 'Failed to patch config via gateway: invalid patch')
    })
  })

  await test('getConfig returns gateway data and preserves failure context', async () => {
    await withGatewayConfig(async (client) => {
      ;(client as any).call = async () => ({ hash: 'hash-1', config: { agents: { list: [] } } })
      assert.strictEqual((await client.getConfig()).hash, 'hash-1')

      ;(client as any).call = async () => { throw new Error('read failed') }
      await expectFailure(() => client.getConfig(), 'Failed to get config via gateway: read failed')
    })
  })

  await test('reloadSecrets refreshes the OpenClaw secrets runtime', async () => {
    await withGatewayConfig(async (client) => {
      const calls: Array<{ method: string; params?: any }> = []
      ;(client as any).call = async (method: string, params?: any) => {
        calls.push({ method, params })
        return { ok: true }
      }

      await client.reloadSecrets()
      assert.deepStrictEqual(calls, [{ method: 'secrets.reload', params: undefined }])

      ;(client as any).call = async () => { throw new Error('reload unavailable') }
      await expectFailure(() => client.reloadSecrets(), 'Failed to reload secrets via gateway: reload unavailable')
    })
  })

  await test('registerAgent appends optional model and skills using the resolved config hash', async () => {
    await withGatewayConfig(async (client) => {
      let patchCall: any
      ;(client as any).getConfig = async () => ({
        hash: 'agents-hash',
        resolved: { agents: { list: [{ id: 'existing' }] } },
      })
      ;(client as any).call = async (method: string, params: any) => {
        patchCall = { method, params }
      }

      await client.registerAgent({
        id: 'new-agent',
        name: 'New Agent',
        workspace: '/workspace',
        agentDir: '/workspace/AGENTS/new-agent',
        model: 'openai/gpt-5-mini',
        skills: ['github'],
      })

      assert.strictEqual(patchCall.method, 'config.patch')
      assert.strictEqual(patchCall.params.baseHash, 'agents-hash')
      const entries = JSON.parse(patchCall.params.raw).agents.entries
      assert.deepStrictEqual(Object.keys(entries), ['new-agent'])
      assert.deepStrictEqual(entries['new-agent'], {
        name: 'New Agent',
        workspace: '/workspace',
        agentDir: '/workspace/AGENTS/new-agent',
        model: 'openai/gpt-5-mini',
        skills: ['github'],
      })
    })
  })

  await test('registerAgent supports raw config responses and omits absent optional fields', async () => {
    await withGatewayConfig(async (client) => {
      let submitted: any
      ;(client as any).getConfig = async () => ({ hash: 'raw-hash', config: {} })
      ;(client as any).call = async (_method: string, params: any) => { submitted = JSON.parse(params.raw) }

      await client.registerAgent({
        id: 'minimal-agent',
        name: 'Minimal Agent',
        workspace: '/workspace',
        agentDir: '/workspace/AGENTS/minimal-agent',
      })

      assert.deepStrictEqual(submitted.agents.entries, {
        'minimal-agent': {
        name: 'Minimal Agent',
        workspace: '/workspace',
        agentDir: '/workspace/AGENTS/minimal-agent',
        },
      })
    })
  })

  await test('registerAgent rejects duplicate IDs with actionable context', async () => {
    await withGatewayConfig(async (client) => {
      ;(client as any).getConfig = async () => ({
        hash: 'hash',
        config: { agents: { list: [{ id: 'duplicate' }] } },
      })
      await expectFailure(() => client.registerAgent({
        id: 'duplicate',
        name: 'Duplicate',
        workspace: '/workspace',
        agentDir: '/workspace/AGENTS/duplicate',
      }), 'Failed to register agent via gateway: Agent duplicate already exists')
    })
  })

  await test('upsertAgent replaces an existing registration and preserves unrelated metadata', async () => {
    await withGatewayConfig(async (client) => {
      let patchCall: any
      ;(client as any).getConfig = async () => ({
        hash: 'upsert-hash',
        resolved: {
          agents: {
            entries: {
              existing: {
                name: 'Old Name',
                workspace: '/old/workspace',
                agentDir: '/old/agent',
                runtime: 'codex',
              },
              sibling: { workspace: '/sibling' },
            },
          },
        },
      })
      ;(client as any).call = async (method: string, params: any) => { patchCall = { method, params } }

      await client.upsertAgent({
        id: 'existing',
        name: 'Existing',
        workspace: '/new/workspace',
        agentDir: '/new/agent',
        model: 'openai/gpt-5.4',
        skills: ['github'],
      })

      assert.strictEqual(patchCall.method, 'config.patch')
      assert.strictEqual(patchCall.params.baseHash, 'upsert-hash')
      const entries = JSON.parse(patchCall.params.raw).agents.entries
      assert.deepStrictEqual(entries.existing, {
        name: 'Existing',
        workspace: '/new/workspace',
        agentDir: '/new/agent',
        runtime: 'codex',
        model: 'openai/gpt-5.4',
        skills: ['github'],
      })
      assert.strictEqual(entries.sibling, undefined)
    })
  })

  await test('upsertAgents batches multiple registrations into one scoped patch', async () => {
    await withGatewayConfig(async (client) => {
      const patchCalls: any[] = []
      ;(client as any).getConfig = async () => ({
        hash: 'batch-hash',
        resolved: { agents: { entries: { existing: { runtime: 'codex', workspace: '/old' } } } },
      })
      ;(client as any).call = async (method: string, params: any) => { patchCalls.push({ method, params }) }

      await client.upsertAgents([
        { id: 'existing', name: 'Existing', workspace: '/new', agentDir: '/agents/existing' },
        { id: 'new-agent', name: 'New Agent', workspace: '/new-agent', agentDir: '/agents/new' },
      ])

      assert.strictEqual(patchCalls.length, 1)
      assert.strictEqual(patchCalls[0].method, 'config.patch')
      assert.strictEqual(patchCalls[0].params.baseHash, 'batch-hash')
      const entries = JSON.parse(patchCalls[0].params.raw).agents.entries
      assert.strictEqual(entries.existing.runtime, 'codex')
      assert.strictEqual(entries.existing.workspace, '/new')
      assert.strictEqual(entries['new-agent'].workspace, '/new-agent')
    })
  })

  await test('upsertAgentsNative provisions through native lifecycle before one guarded supplemental patch', async () => {
    await withGatewayConfig(async (client) => {
      const lifecycleCalls: Array<{ method: string; params: any }> = []
      let configReads = 0
      let patchCall: any
      ;(client as any).getConfig = async () => {
        configReads++
        return configReads === 1
          ? { hash: 'initial-hash', resolved: { agents: { entries: { existing: { workspace: '/old' } } } } }
          : { hash: 'native-hash', resolved: { agents: { entries: {} } } }
      }
      ;(client as any).callAgentLifecycle = async (method: string, params: any) => {
        lifecycleCalls.push({ method, params })
        return method === 'agents.create' ? { ok: true, agentId: params.name } : { ok: true, agentId: params.agentId }
      }
      ;(client as any).call = async (method: string, params: any) => { patchCall = { method, params } }

      await client.upsertAgentsNative([
        { id: 'existing', name: 'Existing', workspace: '/new', agentDir: '/agents/existing', model: 'openai/gpt-5.4' },
        { id: 'new-agent', name: 'New Agent', workspace: '/new-agent', agentDir: '/agents/new', skills: ['github', 'github'] },
      ])

      assert.deepStrictEqual(lifecycleCalls.map((call) => call.method), ['agents.update', 'agents.create'])
      assert.deepStrictEqual(lifecycleCalls[0].params, {
        agentId: 'existing',
        name: 'Existing',
        workspace: '/new',
        model: 'openai/gpt-5.4',
      })
      assert.strictEqual(lifecycleCalls[1].params.name, 'new-agent')
      assert.strictEqual(patchCall.method, 'config.patch')
      assert.strictEqual(patchCall.params.baseHash, 'native-hash')
      assert.deepStrictEqual(JSON.parse(patchCall.params.raw).agents.entries, {
        existing: { agentDir: '/agents/existing' },
        'new-agent': { agentDir: '/agents/new', skills: ['github'] },
      })
    })
  })

  await test('upsertAgentsNative rejects unexpected OpenClaw-created IDs', async () => {
    await withGatewayConfig(async (client) => {
      ;(client as any).getConfig = async () => ({ hash: 'hash', resolved: { agents: { entries: {} } } })
      ;(client as any).callAgentLifecycle = async () => ({ ok: true, agentId: 'different-id' })
      await expectFailure(() => client.upsertAgentsNative([
        { id: 'expected-id', name: 'Expected', workspace: '/workspace', agentDir: '/agents/expected' },
      ]), 'OpenClaw created agent different-id instead of expected-id')
    })
  })

  await test('deleteAgentNative closes state through the native lifecycle and tolerates missing agents', async () => {
    await withGatewayConfig(async (client) => {
      const calls: Array<{ method: string; params: any }> = []
      ;(client as any).callAgentLifecycle = async (method: string, params: any) => {
        calls.push({ method, params })
        return { ok: true, agentId: params.agentId }
      }

      assert.strictEqual(await client.deleteAgentNative('retired-agent'), 'deleted')
      assert.deepStrictEqual(calls, [{
        method: 'agents.delete',
        params: { agentId: 'retired-agent', deleteFiles: false },
      }])

      ;(client as any).callAgentLifecycle = async () => { throw new Error('agent "missing-agent" not found') }
      assert.strictEqual(await client.deleteAgentNative('missing-agent'), 'not-found')
    })
  })

  await test('upsertAgent reports Gateway synchronization failures with context', async () => {
    await withGatewayConfig(async (client) => {
      ;(client as any).getConfig = async () => { throw new Error('gateway busy') }
      await expectFailure(() => client.upsertAgent({
        id: 'new-agent',
        name: 'New Agent',
        workspace: '/workspace',
        agentDir: '/agent',
      }), 'Failed to synchronize agent via gateway: gateway busy')
    })
  })

  await test('configured-state helpers report disk configuration and missing configuration', async () => {
    await withGatewayConfig(async () => {
      assert.strictEqual(isGatewayConfigured(), true)
      assert.strictEqual(getConfiguredGatewayPort(), 18789)
    })

    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-gateway-rpc-missing-'))
    const originalHome = process.env.HOME
    process.env.HOME = tempHome
    try {
      assert.strictEqual(isGatewayConfigured(), false)
      assert.strictEqual(getConfiguredGatewayPort(), null)
      assert.throws(() => getGatewayClient(), /Gateway not available: Failed to load gateway configuration/)
    } finally {
      if (typeof originalHome === 'undefined') delete process.env.HOME
      else process.env.HOME = originalHome
      fs.rmSync(tempHome, { recursive: true, force: true })
    }
  })

  await test('gateway execution stays gateway-backed while its owned process is temporarily unresponsive', async () => {
    assert.strictEqual(shouldTreatGatewayAsRunning(true, false), true)
    assert.strictEqual(shouldTreatGatewayAsRunning(false, true), true)
    assert.strictEqual(shouldTreatGatewayAsRunning(false, false), false)
  })

  console.log(`\nTests passed: ${testsPassed}`)
  console.log(`Tests failed: ${testsFailed}`)
  if (testsFailed > 0) process.exit(1)
  console.log('\nAll tests passed')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
