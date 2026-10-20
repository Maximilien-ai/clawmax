import assert from 'assert'
import crypto from 'crypto'
import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import express from 'express'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { createInstanceWorkflowsRouter } from './instance-workflows'
import type { WorkflowExecution } from '../lib/workflows'

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-workflow-contract-'))
  const runs = new Map<string, WorkflowExecution>()
  const active = new Set<string>()
  let starts = 0
  let cancels = 0
  let failStart = false
  let holdCancellation = false
  let immediateCompletion = false
  const app = express()
  app.use(express.json({ limit: '2mb' }))
  app.use('/api/cli/v1/workspaces/:workspaceId', createInstanceWorkflowsRouter({
    authorize(req, res) {
      const actorId = req.get('authorization')
      if (!actorId) { res.status(401).end(); return null }
      if (req.params.workspaceId !== 'test') { res.status(403).end(); return null }
      return { actorId, workspaceId: 'test', workspacePath: root, assertAuthorized() {}, run: async fn => fn() }
    },
    cancelWaitMs: 0,
    runtime: {
      getWorkflow: id => id === 'missing' ? null : ({ id, name: 'Synthetic', description: '', enabled: false, status: 'idle' } as any),
      triggerWorkflow(id, options) {
        starts++
        assert.strictEqual(options?.executionScope, 'single-workflow')
        assert.strictEqual(options?.manual, true)
        assert(options?.actor?.userId)
        assert.deepStrictEqual(Object.keys(options || {}).sort(), ['actor', 'assertAuthorized', 'executionScope', 'inputs', 'manual'])
        options!.assertAuthorized!()
        if (failStart) return { success: false, error: 'secret-diagnostic' }
        const runId = crypto.randomUUID()
        const completed = immediateCompletion && id !== 'cancellable'
        runs.set(runId, {
          id: runId, workflowId: id, startedAt: new Date().toISOString(), status: completed ? 'completed' : 'running',
          triggerType: 'manual', logs: ['secret-diagnostic'], participants: [{ agentId: 'synthetic', agentName: 'Synthetic', status: 'completed', response: 'Hello' } as any],
          outputs: { report: { type: 'text', value: 'Hello', artifactPath: '/private/do-not-expose' } },
        })
        if (!completed) active.add(runId)
        return { success: true, executionId: runId }
      },
      getExecution: (workflowId, runId) => runs.get(runId)?.workflowId === workflowId ? runs.get(runId)! : null,
      isWorkflowExecutionActive: (_workflowId, runId) => active.has(runId),
      cancelExecution(_workflowId, runId) {
        cancels++
        const run = runs.get(runId)!
        run.status = 'cancelled'
        run.completedAt = new Date().toISOString()
        if (!holdCancellation) active.delete(runId)
        return { success: true }
      },
    },
  }))
  const server = http.createServer(app)
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const base = `http://127.0.0.1:${(server.address() as import('net').AddressInfo).port}`
  const request = async (route: string, body?: unknown, actor = 'alice', workspace = 'test') => {
    const response = await fetch(`${base}/api/cli/v1/workspaces/${workspace}/${route}`, {
      method: body ? 'POST' : 'GET', headers: { ...(actor ? { authorization: actor } : {}), 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const text = await response.text()
    return { status: response.status, text, json: text ? JSON.parse(text) : null }
  }
  const start = (key: string, input: object = {}) => ({ apiVersion: 'clawmax.instance/v1', kind: 'WorkflowRunRequest', input, idempotencyKey: key })
  const cancel = (key: string) => ({ apiVersion: 'clawmax.instance/v1', kind: 'WorkflowRunCancelRequest', idempotencyKey: key })
  let passed = 0
  const test = async (name: string, fn: () => Promise<void>) => { await fn(); passed++; console.log(`✓ ${name}`) }
  try {
    await test('auth and workspace isolation precede execution', async () => {
      assert.strictEqual((await request('workflows/review/runs', start('unauth'), '')).status, 401)
      assert.strictEqual((await request('workflows/review/runs', start('forbidden'), 'alice', 'other')).status, 403)
      assert.strictEqual(starts, 0)
    })
    await test('strict requests reject execution overrides and non-string inputs', async () => {
      for (const body of [{ ...start('bad'), byok: {} }, start('nested', { input: {} }), { ...start('kind'), kind: 'bad' }, { ...start('key'), idempotencyKey: '../bad' }]) {
        assert.strictEqual((await request('workflows/review/runs', body)).status, 400)
      }
      assert.strictEqual((await request('workflows/tr-0123456789abcdef-workflow-0123456789ab/runs', start('reserved'))).status, 409)
      assert.strictEqual((await request('workflows/missing/runs', start('missing'))).status, 404)
      assert.strictEqual(starts, 0)
    })
    let id = ''
    await test('start is correlated and idempotent without enabling schedules or DAG execution', async () => {
      const result = await request('workflows/review/runs', start('first'))
      assert.strictEqual(result.status, 201)
      assert.strictEqual(result.json.kind, 'WorkflowRun')
      id = result.json.run.id
      assert.strictEqual(result.json.run.workspaceId, 'test')
      assert.strictEqual(result.json.run.workflowId, 'review')
      assert.strictEqual(result.json.run.status, 'running')
      assert.strictEqual(result.json.run.outputAvailable, false)
      assert.strictEqual((await request('workflows/review/runs', start('first'))).json.run.id, id)
      assert.strictEqual((await request('workflows/review/runs', start('first', { x: 'changed' }))).status, 409)
      assert.strictEqual(starts, 1)
    })
    await test('list/detail/result/cancel cannot access another actor run', async () => {
      assert.strictEqual((await request(`workflow-runs/${id}`, undefined, 'bob')).status, 404)
      assert.strictEqual((await request(`workflow-runs/${id}/result`, undefined, 'bob')).status, 404)
      assert.strictEqual((await request(`workflow-runs/${id}/cancel`, cancel('steal'), 'bob')).status, 404)
      assert.deepStrictEqual((await request('workflows/review/runs', undefined, 'bob')).json.items, [])
      assert.strictEqual((await request('workflows/review/runs')).json.items.length, 1)
      assert.strictEqual((await request('workflows/review')).json.kind, 'Workflow')
      assert.strictEqual(cancels, 0)
    })
    await test('result waits for settlement and excludes internal paths and logs', async () => {
      runs.get(id)!.status = 'completed'
      assert.strictEqual((await request(`workflow-runs/${id}/result`)).status, 409)
      active.delete(id)
      const result = await request(`workflow-runs/${id}/result`)
      assert.strictEqual(result.json.status, 'succeeded')
      assert.strictEqual(result.json.runId, id)
      assert.strictEqual(result.json.output.participants[0].response, 'Hello')
      assert(!result.text.includes('secret-diagnostic'))
      assert(!result.text.includes('/private/'))
    })
    await test('cancellation is not terminal until the runtime settles', async () => {
      const runId = (await request('workflows/review/runs', start('cancellable'))).json.run.id
      holdCancellation = true
      const pending = await request(`workflow-runs/${runId}/cancel`, cancel('cancel'))
      assert.strictEqual(pending.status, 409)
      assert.strictEqual(pending.json.error.code, 'cancellation_pending')
      assert.strictEqual(pending.json.error.retryable, true)
      assert.strictEqual((await request(`workflow-runs/${runId}`)).json.run.status, 'running')
      assert.strictEqual((await request(`workflow-runs/${runId}/result`)).status, 409)
      active.delete(runId)
      const settled = await request(`workflow-runs/${runId}/cancel`, cancel('cancel'))
      assert.strictEqual(settled.json.run.status, 'cancelled')
      assert.strictEqual(cancels, 1)
      assert.strictEqual((await request(`workflow-runs/${id}/cancel`, cancel('cancel'))).status, 409)
      assert.strictEqual((await request(`workflow-runs/${runId}/result`)).json.status, 'cancelled')
      holdCancellation = false
    })
    await test('failed starts replay safely without retrying execution or exposing diagnostics', async () => {
      failStart = true
      const before = starts
      const result = await request('workflows/review/runs', start('fail'))
      assert.strictEqual(result.status, 409)
      assert(!result.text.includes('secret-diagnostic'))
      assert.strictEqual((await request('workflows/review/runs', start('fail'))).status, 409)
      assert.strictEqual(starts, before + 1)
      failStart = false
    })
    await test('orphaned running records fail closed after loss of runtime ownership', async () => {
      const runId = (await request('workflows/review/runs', start('orphan'))).json.run.id
      active.delete(runId)
      assert.strictEqual((await request(`workflow-runs/${runId}`)).json.run.status, 'failed')
      assert.strictEqual((await request(`workflow-runs/${runId}/result`)).json.status, 'failed')
    })
    await test('an empty completed runtime response is not successful acceptance', async () => {
      const runId = (await request('workflows/review/runs', start('empty'))).json.run.id
      active.delete(runId)
      runs.get(runId)!.status = 'completed'
      runs.get(runId)!.participants = []
      assert.strictEqual((await request(`workflow-runs/${runId}/result`)).json.status, 'failed')
    })
    await test('unfinished durable claims and corrupted receipts cannot redispatch', async () => {
      const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex')
      const dir = path.join(root, '.clawmax', 'cli-workflows', hash('alice'))
      const claim = path.join(dir, `claim-${hash('WorkflowRunRequest:unfinished')}.json`)
      fs.writeFileSync(claim, JSON.stringify({ digest: hash(JSON.stringify(['review', '{}'])) }))
      const before = starts
      assert.strictEqual((await request('workflows/review/runs', start('unfinished'))).json.error.code, 'workflow_outcome_pending')
      fs.writeFileSync(claim, '{')
      assert.strictEqual((await request('workflows/review/runs', start('unfinished'))).status, 503)
      assert.strictEqual(starts, before)
    })
    if (process.argv[2]) await test('CLI strict Go client validates workflow lifecycle responses', async () => {
      immediateCompletion = true
      const { stdout } = await promisify(execFile)('go', ['run', path.resolve(__dirname, '../../scripts/fixtures/workflow-cli-contract.go'), base], {
        cwd: path.resolve(process.argv[2]), timeout: 120000, maxBuffer: 65536,
      })
      process.stdout.write(stdout)
    })
    console.log(`${passed} instance workflow contract tests passed`)
  } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    fs.rmSync(root, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
