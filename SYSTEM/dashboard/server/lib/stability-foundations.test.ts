import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { WorkspaceManager } from './workspace-manager'
import { createGatewayReadinessCheck, createHealthHandler, verifyCorePersistentStateReadable } from './startup-readiness'

// No model calls, shared gateway, operator registry, or installed CLI state.
// This is a deterministic foundation gate, not live orchestration acceptance.
async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-stability-foundations-'))
  const previousWorkspace = process.env.OPENCLAW_WORKSPACE
  process.env.OPENCLAW_WORKSPACE = path.join(root, 'default')
  try {
    const registry = path.join(root, 'registry.json')
    const manager = new WorkspaceManager(registry)
    const alpha = manager.createWorkspace('Stability Alpha', path.join(root, 'alpha'))
    const beta = manager.createWorkspace('Stability Beta', path.join(root, 'beta'))
    const active = manager.getActiveWorkspace().id
    const snapshot = fs.readFileSync(registry, 'utf8')
    await Promise.all(Array.from({ length: 100 }, async (_, index) => {
      const target = index % 2 ? alpha : beta
      await manager.withWorkspace(target.id, async () => {
        assert.equal(manager.getActiveWorkspace().id, target.id)
        await new Promise<void>(resolve => setImmediate(resolve))
        assert.equal(manager.getActiveWorkspace().path, target.path)
        const other = target.id === alpha.id ? beta : alpha
        await manager.withWorkspace(other.id, async () => {
          await Promise.resolve()
          assert.equal(manager.getActiveWorkspace().id, other.id)
        })
        assert.equal(manager.getActiveWorkspace().id, target.id)
      })
    }))
    await assert.rejects(manager.withWorkspace(alpha.id, async () => { throw new Error('synthetic cancellation') }), /synthetic cancellation/)
    assert.equal(manager.getActiveWorkspace().id, active)
    assert.equal(fs.readFileSync(registry, 'utf8'), snapshot, 'Context switching must not persist selection changes')
    const reopened = new WorkspaceManager(registry)
    assert.equal(reopened.getActiveWorkspace().id, active)
    assert.equal(reopened.getWorkspace(alpha.id)?.path, alpha.path)
    assert.equal(reopened.getWorkspace(beta.id)?.path, beta.path)

    let clock = 0
    let probes = 0
    let state: 'up' | 'down' | 'error' = 'up'
    const check = createGatewayReadinessCheck(async () => {
      probes++
      await new Promise<void>(resolve => setImmediate(resolve))
      if (state === 'error') throw new Error('synthetic-private-provider-detail')
      return { running: state === 'up' }
    }, () => clock)
    const startup = verifyCorePersistentStateReadable([{ name: 'agents', read: () => [{ id: 'synthetic' }] }])
    const handler = createHealthHandler({ getStartupReadiness: () => startup, workspace: root, gatewayRequired: () => true, gatewayReady: check })
    for (let cycle = 0; cycle < 30; cycle++) {
      for (const next of ['up', 'down', 'error', 'up'] as const) {
        state = next
        clock += 1001
        const before = probes
        await Promise.all(Array.from({ length: 20 }, async () => {
          let status = 0
          let payload: any
          await handler(null, { status: value => { status = value }, json: value => { payload = value } })
          assert.equal(status, next === 'up' ? 200 : 503)
          assert.equal(payload.readiness.gateway.ready, next === 'up')
          assert.deepEqual(payload.readiness.stores, { agents: 1 })
          assert(!JSON.stringify(payload).includes('synthetic-private-provider-detail'))
        }))
        assert.equal(probes - before, 1, 'Health bursts must share a probe through repeated failures and recovery')
      }
    }
    console.log('stability-foundations.test.ts: passed (100 concurrent workspace scopes; 30 recovery cycles; 2400 health requests)')
  } finally {
    if (previousWorkspace === undefined) delete process.env.OPENCLAW_WORKSPACE
    else process.env.OPENCLAW_WORKSPACE = previousWorkspace
    fs.rmSync(root, { recursive: true, force: true })
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
