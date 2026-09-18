import assert from 'assert'
import express from 'express'
import http from 'http'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { RecoveryServingGate, recoveryRequestGate } from './recovery-serving-gate'
import { TemplateRecoveryWorker } from './template-recovery-worker'
import { TemplateGatewayTransaction, TemplateGatewayTransport } from './template-gateway-transaction'
import { recoverTemplatesBeforeStartup } from './template-startup-recovery'
import { assertWorkspaceRecovered } from './workspace-recovery-admission'
import { createHealthHandler, verifyCorePersistentStateReadable } from './startup-readiness'

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-recovery-http-'))
  let server: http.Server | undefined
  let worker: TemplateRecoveryWorker | undefined
  try {
    const workspace = { id: 'active', path: path.join(root, 'workspace') }
    const id = 'tr-0123456789abcdef-agent-0123456789ab'
    let available = true
    let revision = 0
    const entries: Record<string, unknown> = { unrelated: { name: 'Keep' } }
    const transport: TemplateGatewayTransport = {
      async snapshot() { if (!available) throw new Error('Private gateway details'); return { hash: String(revision), entries: structuredClone(entries) } },
      async patch(changes, hash) {
        assert.equal(hash, String(revision++))
        for (const [key, value] of Object.entries(changes)) { if (value === null) delete entries[key]; else entries[key] = value }
      },
    }
    await new TemplateGatewayTransaction(workspace.path, transport).register('a'.repeat(64), { [id]: {
      name: 'Staged', workspace: path.join(workspace.path, 'AGENTS', id), agentDir: path.join(root, 'runtime', id),
      model: 'test/model', skills: [], tools: { deny: ['*'] }, heartbeat: { every: '0m' },
    } })
    available = false
    await recoverTemplatesBeforeStartup([workspace], transport, path.join(root, 'runtime'), { isolateFailures: true })
    let services = 0
    const gate = new RecoveryServingGate(() => assertWorkspaceRecovered(workspace.path), () => { services++ })
    let retry!: () => Promise<void>
    worker = new TemplateRecoveryWorker([workspace], async item => {
      await recoverTemplatesBeforeStartup([item], transport, path.join(root, 'runtime'))
      gate.resume()
    }, { now: Date.now, schedule(task) { retry = task; return () => {} } })
    const app = express()
    app.use('/api', recoveryRequestGate(() => gate.ready))
    app.get('/api/health/live', (_req, res) => res.json({ alive: true }))
    app.get('/api/recovery', (_req, res) => res.json({ ready: gate.ready, retry: worker!.diagnostics() }))
    app.get('/api/health', createHealthHandler({
      getStartupReadiness: () => gate.ready ? verifyCorePersistentStateReadable([]) : null,
      workspace: 'synthetic', gatewayRequired: () => true, gatewayReady: async () => available,
    }))
    let mutations = 0
    app.post('/api/workflows', (_req, res) => { mutations++; res.json({ ok: true }) })
    app.post('/api/runtime/skill-broker', (_req, res) => { mutations++; res.json({ ok: true }) })
    server = http.createServer(app)
    await new Promise<void>((resolve, reject) => { server!.once('error', reject); server!.listen(0, '127.0.0.1', resolve) })
    const address = server.address()
    assert(address && typeof address !== 'string')
    const base = `http://127.0.0.1:${address.port}`
    gate.onListening(); worker.start()
    const request = (route: string, method = 'GET') => fetch(`${base}${route}`, { method, signal: AbortSignal.timeout(5000) })
    for (let attempt = 0; attempt < 2; attempt++) {
      assert.equal((await request('/api/health/live')).status, 200)
      assert.equal((await request('/api/health')).status, 503)
      for (const route of ['/api/workflows', '/api/runtime/skill-broker', '/api/cli/v1/workspaces']) {
        const response = await request(route, 'POST')
        assert.equal(response.status, 503)
        assert.equal(response.headers.get('retry-after'), '30')
        const body = await response.json() as any
        assert.equal(body.error.retryable, true)
        assert(body.requestId)
      }
      const status = await (await request('/api/recovery')).text()
      assert(!status.includes(root) && !status.includes('Private'))
      assert.equal(services, 0)
      assert.equal(mutations, 0)
      if (attempt === 0) await retry()
    }
    available = true
    await retry()
    assert.equal((await request('/api/health')).status, 200)
    assert.equal((await request('/api/workflows', 'POST')).status, 200)
    assert.equal(mutations, 1)
    assert.equal(services, 1)
    assert.deepEqual(entries, { unrelated: { name: 'Keep' } })
    gate.stop(); worker.stop()
    assert.equal((await request('/api/workflows', 'POST')).status, 503)
    assert.equal(mutations, 1)
    console.log('recovery-serving-http.test.ts: passed (real loopback HTTP; simulated gateway; no model calls)')
  } finally {
    worker?.stop()
    if (server?.listening) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()))
    fs.rmSync(root, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
