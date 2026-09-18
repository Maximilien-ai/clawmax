import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'
import { GatewayRPCClient } from './gateway-rpc'
import { createTemplateGatewayTransport, TemplateGatewayEntry, TemplateGatewayTransaction, TemplateGatewayTransport } from './template-gateway-transaction'
import { writeAtomicJson } from './instance-template-catalog'

const agentId = 'tr-0123456789abcdef-agent-0123456789ab'
const planDigest = 'a'.repeat(64)
function entry(root: string): TemplateGatewayEntry {
  return { name: 'Synthetic', workspace: path.join(root, 'AGENTS', agentId), agentDir: path.join(root, 'runtime', agentId), model: 'openai/test', skills: [], tools: { deny: ['*'] }, heartbeat: { every: '0m' } }
}
function diskTransport(root: string, crash = false): TemplateGatewayTransport {
  const file = path.join(root, 'synthetic-gateway.json')
  return {
    async snapshot() { return JSON.parse(fs.readFileSync(file, 'utf8')) },
    async patch(entries, hash) {
      const state = JSON.parse(fs.readFileSync(file, 'utf8'))
      assert.equal(state.hash, hash, 'Gateway CAS conflict')
      for (const [id, value] of Object.entries(entries)) {
        if (value === null) delete state.entries[id]
        else state.entries[id] = value
      }
      state.hash = `${Number(state.hash) + 1}`
      writeAtomicJson(file, state)
      if (crash) process.exit(77)
    },
  }
}
async function main() {
  if (process.argv[2] === '--crash') {
    const root = process.argv[3]
    await new TemplateGatewayTransaction(root, diskTransport(root, true)).register(planDigest, { [agentId]: entry(root) })
    throw new Error('Expected process loss')
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-template-gateway-'))
  try {
    // Exercise actual GatewayRPCClient method without constructing a connection.
    const client = Object.create(GatewayRPCClient.prototype) as GatewayRPCClient
    let captured: any
    ;(client as any).callConfig = async (method: string, params: any) => { captured = { method, params } }
    await client.patchTemplateAgentEntriesAtRevision({ [agentId]: entry(root) as any }, 'revision-1')
    assert.equal(captured.method, 'config.patch')
    assert.equal(captured.params.baseHash, 'revision-1')
    assert.equal(captured.params.replacePaths, undefined, 'Registration must not authorize destructive array replacement')
    assert.deepEqual(JSON.parse(captured.params.raw), { agents: { entries: { [agentId]: entry(root) } } })
    await assert.rejects(client.patchTemplateAgentEntriesAtRevision({ unrelated: null }, 'hash'), /scoped Template/)
    await assert.rejects(client.patchTemplateAgentEntriesAtRevision({ [agentId]: null }, ''), /revision/)
    const adapter = createTemplateGatewayTransport({
      getConfig: async () => ({ hash: 'server-hash', sourceConfig: { agents: { entries: { unrelated: { name: 'keep' } } } } }),
      patchTemplateAgentEntriesAtRevision: client.patchTemplateAgentEntriesAtRevision.bind(client),
    })
    assert.deepEqual(await adapter.snapshot(), { hash: 'server-hash', entries: { unrelated: { name: 'keep' } } })
    await adapter.patch({ [agentId]: null }, 'server-hash')
    assert.equal(captured.params.baseHash, 'server-hash')
    assert.deepEqual(captured.params.replacePaths, [`agents.entries.${agentId}.skills`, `agents.entries.${agentId}.tools.deny`])
    assert.deepEqual(JSON.parse(captured.params.raw), { agents: { entries: { [agentId]: null } } })
    const legacy = createTemplateGatewayTransport({ getConfig: async () => ({ hash: 'hash', config: { agents: { list: [] } } }), patchTemplateAgentEntriesAtRevision: async () => {} })
    await assert.rejects(legacy.snapshot(), /keyed gateway roster/)

    const file = path.join(root, 'synthetic-gateway.json')
    const unrelated = { name: 'preserve', model: 'existing-model' }
    writeAtomicJson(file, { hash: '1', entries: { unrelated } })
    const transport = diskTransport(root)
    const transaction = new TemplateGatewayTransaction(root, transport)
    await assert.rejects(transaction.register(planDigest, { [agentId]: { ...entry(root), tools: { deny: [] } } }), /Invalid Template/)
    assert(!fs.existsSync(path.join(root, '.clawmax')))
    await transaction.register(planDigest, { [agentId]: entry(root) })
    await assert.rejects(transaction.register(planDigest, { [agentId]: entry(root) }), /Recover the previous/)
    const reopened = new TemplateGatewayTransaction(root, transport)
    assert.equal(await reopened.recover(() => false), 'rolled-back')
    assert.deepEqual((await transport.snapshot()).entries, { unrelated })
    assert.equal(await reopened.recover(() => false), 'none')

    // Lost successful response: retain intent, then reconcile exact owned IDs.
    const losingTransport = { ...transport, patch: async (entries: Record<string, TemplateGatewayEntry | null>, hash: string) => { await transport.patch(entries, hash); throw new Error('synthetic response loss') } }
    await assert.rejects(new TemplateGatewayTransaction(root, losingTransport).register(planDigest, { [agentId]: entry(root) }), /requires recovery/)
    assert.equal(await reopened.recover(digest => digest === planDigest), 'committed')
    assert.deepEqual((await transport.snapshot()).entries[agentId], entry(root))
    await assert.rejects(transaction.register(planDigest, { [agentId]: entry(root) }), /already exists/)
    await transport.patch({ [agentId]: null }, (await transport.snapshot()).hash)

    // Actual process exit after the synthetic server durably commits its patch.
    const child = spawnSync(process.execPath, ['-r', 'ts-node/register/transpile-only', __filename, '--crash', root], { encoding: 'utf8', timeout: 15000 })
    assert.equal(child.status, 77, child.stderr)
    assert((await transport.snapshot()).entries[agentId])
    assert.equal(await reopened.recover(() => false), 'rolled-back')
    assert.deepEqual((await transport.snapshot()).entries, { unrelated })

    // Rollback response loss is also replayable; no unrelated entry is removed.
    await transaction.register(planDigest, { [agentId]: entry(root) })
    await assert.rejects(new TemplateGatewayTransaction(root, losingTransport).recover(() => false), /rollback requires recovery/)
    assert.equal(await reopened.recover(() => false), 'rolled-back')
    assert.deepEqual((await transport.snapshot()).entries, { unrelated })

    // Refuse cleanup if an owned registration changed; do not overwrite it.
    await transaction.register(planDigest, { [agentId]: entry(root) })
    const modified = { ...entry(root), name: 'operator edit' }
    await transport.patch({ [agentId]: modified }, (await transport.snapshot()).hash)
    await assert.rejects(reopened.recover(() => false), /changed outside/)
    assert.deepEqual((await transport.snapshot()).entries[agentId], modified)
    await transport.patch({ [agentId]: entry(root) }, (await transport.snapshot()).hash)
    await transport.patch({ [agentId]: null }, (await transport.snapshot()).hash)
    await assert.rejects(reopened.recover(() => true), /registration is missing/)
    assert.equal(await reopened.recover(() => false), 'rolled-back')

    // A stale configuration hash cannot stomp a concurrent unrelated write.
    const conflicting = { ...transport, patch: async (entries: Record<string, TemplateGatewayEntry | null>, hash: string) => {
      const state = await transport.snapshot()
      writeAtomicJson(file, { hash: `${Number(state.hash) + 1}`, entries: { ...state.entries, later: { name: 'preserve too' } } })
      await transport.patch(entries, hash)
    } }
    await assert.rejects(new TemplateGatewayTransaction(root, conflicting).register(planDigest, { [agentId]: entry(root) }), /requires recovery/)
    assert.equal(await reopened.recover(() => false), 'rolled-back')
    assert.deepEqual((await transport.snapshot()).entries, { unrelated, later: { name: 'preserve too' } })

    const secondId = 'tr-0123456789abcdef-agent-fedcba987654'
    const secondEntry = { ...entry(root), workspace: path.join(root, 'AGENTS', secondId), agentDir: path.join(root, 'runtime', secondId) }
    const patches: Array<Record<string, TemplateGatewayEntry | null>> = []
    const counted = { ...transport, patch: async (entries: Record<string, TemplateGatewayEntry | null>, hash: string) => { patches.push(entries); await transport.patch(entries, hash) } }
    const multiple = new TemplateGatewayTransaction(root, counted)
    await multiple.register(planDigest, { [agentId]: entry(root), [secondId]: secondEntry })
    assert.equal(patches.length, 1, 'All Agents must register in a single CAS patch')
    assert.deepEqual(Object.keys(patches[0]).sort(), [agentId, secondId].sort())
    await multiple.recover(() => false)
    assert.equal(patches.length, 2, 'All owned Agents must roll back in one scoped patch')
    assert.deepEqual(patches[1], { [agentId]: null, [secondId]: null })

    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    let reads = 0
    const delayed = { ...transport, snapshot: async () => { if (reads++ === 0) await gate; return transport.snapshot() } }
    const pending = new TemplateGatewayTransaction(root, delayed).register(planDigest, { [agentId]: entry(root) })
    await assert.rejects(transaction.register(planDigest, { [secondId]: secondEntry }), /busy/)
    release()
    await pending
    await reopened.recover(() => false)
    const journalPath = path.join(root, '.clawmax/template-gateway-transaction.json')
    fs.writeFileSync(journalPath, '{broken')
    await assert.rejects(reopened.recover(() => false), /requires inspection/)
    assert.deepEqual((await transport.snapshot()).entries, { unrelated, later: { name: 'preserve too' } })
    console.log('template-gateway-transaction.test.ts: passed')
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
