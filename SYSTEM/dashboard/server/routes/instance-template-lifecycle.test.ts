import assert from 'assert'
import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import express from 'express'
import { createInstanceTemplatesRouter } from './instance-templates'
import { InstanceTemplateCatalog } from '../lib/instance-template-catalog'
import { templateFixture } from '../lib/portable-template.test'
import { validatePortableTemplate } from '../lib/portable-template'
import { createTemplateResourceFileCompiler } from '../lib/template-resource-files'
import { TemplateRevisionStore } from '../lib/template-revisions'
import { TemplateApplyCoordinator } from '../lib/template-apply-coordinator'
import { TemplateGatewayTransaction, TemplateGatewayTransport } from '../lib/template-gateway-transaction'
import { PortableTemplateError } from '../lib/portable-template-zip'

function files(root: string): Record<string, string> {
  const result: Record<string, string> = {}
  const visit = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) visit(file)
      else result[path.relative(root, file)] = fs.readFileSync(file).toString('base64')
    }
  }
  visit(root)
  return result
}
async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-lifecycle-http-'))
  const workspace = path.join(root, 'workspace')
  const app = express()
  const server = http.createServer(app)
  try {
    const bytes = await templateFixture()
    const bundle = await validatePortableTemplate(bytes)
    const catalog = new InstanceTemplateCatalog(workspace, 'owned')
    const template = catalog.import(bundle, bytes, 'actor', 'import').template
    let revision = 0
    let running = false
    let mismatch = false
    let coordinatorMismatch = false
    const entries: Record<string, unknown> = { unrelated: { name: 'Preserve' } }
    const transport: TemplateGatewayTransport = {
      async snapshot() { return { hash: String(revision), entries: structuredClone(entries) } },
      async patch(changes, hash) {
        assert.equal(hash, String(revision++))
        for (const [id, entry] of Object.entries(changes)) { if (entry === null) delete entries[id]; else entries[id] = entry }
      },
    }
    const runtime = { platform: 'linux/amd64', revision: 'fixture-v1' }
    const registry = {
      apiVersion: 'clawmax.template-authority/v1alpha1', workspaceId: 'owned', revision: 'v1',
      bindings: bundle.artifacts.filter(item => item.kind === 'agent').map(agent => ({
        id: `${agent.id}-binding`, revision: 'v1', artifactId: agent.id, artifactDigest: agent.digest,
        actorIds: ['actor'], disabled: false, model: { id: 'openai/test', revision: 'v1' },
        policy: { id: 'no-tools', sha256: 'a'.repeat(64) }, runtime, skills: [], credentials: [],
      })),
    }
    const compiler = createTemplateResourceFileCompiler(workspace, { read: () => registry, runtime })
    const store = new TemplateRevisionStore(workspace, 'owned', compiler)
    const coordinator = new TemplateApplyCoordinator(store, new TemplateGatewayTransaction(workspace, transport), path.join(root, 'runtime'))
    const authorize = (req: express.Request, res: express.Response) => {
      const actorId = req.get('Authorization') === 'Bearer owner-fixture' ? 'actor' : req.get('Authorization') === 'Bearer other-fixture' ? 'other' : null
      if (!actorId || req.params.workspaceId !== 'owned') { res.status(actorId ? 403 : 401).json({ kind: 'Error' }); return null }
      return { workspaceId: 'owned', workspacePath: workspace, actorId }
    }
    const dependencies = { authorize, dashboardVersion: () => 'fixture', openClawVersion: () => 'fixture' }
    app.use('/disabled/:workspaceId', createInstanceTemplatesRouter(dependencies))
    app.use('/api/cli/v1/workspaces/:workspaceId', createInstanceTemplatesRouter({ ...dependencies, lifecycle: () => ({
      store: mismatch ? new TemplateRevisionStore(workspace, 'wrong', compiler) : store,
      coordinator: coordinatorMismatch ? new TemplateApplyCoordinator(new TemplateRevisionStore(path.join(root, 'foreign'), 'foreign', compiler), new TemplateGatewayTransaction(path.join(root, 'foreign'), transport), path.join(root, 'runtime')) : coordinator,
      assertStopped() { if (running) throw new PortableTemplateError('resources_running', 'Stop owned resources first', 409) },
    }) }))
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    const address = server.address() as { port: number }
    const call = async (route: string, method = 'GET', value?: unknown, token = 'owner-fixture') => {
      const response = await fetch(`http://127.0.0.1:${address.port}${route}`, {
        method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(value === undefined ? {} : { body: typeof value === 'string' ? value : JSON.stringify(value) }), signal: AbortSignal.timeout(5000),
      })
      assert(response.headers.get('content-type')?.includes('application/json'))
      return { status: response.status, body: await response.json() as any }
    }
    const base = '/api/cli/v1/workspaces/owned'
    const request = { templateId: template.id, expectedRevision: null, idempotencyKey: 'apply', bindings: { producer: 'producer-binding', reviewer: 'reviewer-binding' } }
    const initial = files(root)
    assert.equal((await call('/disabled/owned/package-plans', 'POST', request)).body.error.code, 'template_lifecycle_unavailable')
    assert.equal((await call(`${base}/package-plans`, 'POST', '{malformed', 'unknown')).status, 401)
    assert.equal((await call('/api/cli/v1/workspaces/foreign/revisions')).status, 403)
    assert.equal((await call(`${base}/package-plans`, 'POST', '{malformed')).status, 400)
    assert.equal((await call(`${base}/package-plans`, 'POST', { ...request, bindings: { oversized: 'a'.repeat(70 * 1024) } })).status, 413)
    assert.equal((await call(`${base}/package-plans`, 'POST', { ...request, actorId: 'other' })).status, 400)
    assert.equal((await call(`${base}/package-plans`, 'POST', request, 'other-fixture')).status, 409)
    mismatch = true
    assert.equal((await call(`${base}/package-plans`, 'POST', request)).status, 503)
    mismatch = false
    coordinatorMismatch = true
    assert.equal((await call(`${base}/package-plans`, 'POST', request)).status, 503)
    coordinatorMismatch = false
    const planned = await call(`${base}/package-plans`, 'POST', request)
    assert.equal(planned.status, 200)
    assert.equal(planned.body.kind, 'TemplatePlan')
    assert.deepEqual(files(root), initial, 'Planning and rejected requests cannot persist files')
    assert.equal(revision, 0, 'Planning cannot contact the mutating transport')
    const payload = { request, planDigest: planned.body.planDigest }
    assert.equal((await call(`${base}/revisions`, 'POST', { request, planDigest: 'b'.repeat(64) })).status, 409)
    assert.equal(revision, 0, 'Stale apply plans must not mutate the gateway')
    const applied = await call(`${base}/revisions`, 'POST', payload)
    assert.equal(applied.status, 201)
    assert.equal((await call(`${base}/revisions`, 'POST', payload)).status, 200)
    const id = applied.body.revision.id
    const inspected = await call(`${base}/revisions/${id}`)
    assert.deepEqual(inspected.body.revision, applied.body.revision)
    assert.equal((await call(`${base}/revisions/${id}`, 'GET', undefined, 'other-fixture')).status, 403)
    assert.deepEqual((await call(`${base}/revisions`, 'GET', undefined, 'other-fixture')).body.items, [])
    assert.equal((await call(`${base}/revisions`)).body.items.length, 1)
    assert(!JSON.stringify(inspected.body).includes(root))
    assert(!JSON.stringify(inspected.body).includes('"undo"'))
    assert(!JSON.stringify(inspected.body).includes('agentDir'))
    assert.equal((await call(`${base}/package-plans`, 'POST', { ...request, idempotencyKey: 'new-apply' })).status, 409)
    running = true
    assert.equal((await call(`${base}/revisions/${id}/cleanup-plans`, 'POST', { expectedRevision: id })).status, 409)
    running = false
    const beforeCleanup = files(root)
    const cleanupPlan = await call(`${base}/revisions/${id}/cleanup-plans`, 'POST', { expectedRevision: id })
    assert.equal(cleanupPlan.status, 200)
    assert.deepEqual(files(root), beforeCleanup)
    const cleanup = { expectedRevision: id, planDigest: cleanupPlan.body.planDigest }
    assert.equal((await call(`${base}/revisions/${id}/cleanup`, 'POST', cleanup, 'other-fixture')).status, 403)
    running = true
    assert.equal((await call(`${base}/revisions/${id}/cleanup`, 'POST', cleanup)).status, 409)
    running = false
    catalog.remove(template.id)
    const removed = await call(`${base}/revisions/${id}/cleanup`, 'POST', cleanup)
    assert.equal(removed.status, 200)
    assert(removed.body.removed)
    assert.equal((await call(`${base}/revisions/${id}/cleanup`, 'POST', cleanup)).body.removed, false)
    assert((await call(`${base}/revisions/${id}`)).body.revision.cleanedAt)
    assert.deepEqual(entries, { unrelated: { name: 'Preserve' } })
    assert(!(await call(`${base}/capabilities`)).body.templates.operations.includes('apply'), 'Staging contract must not advertise execution readiness')
    console.log('instance-template-lifecycle.test.ts: passed (real HTTP; staged resources; synthetic gateway; no execution admission)')
  } finally {
    server.closeAllConnections()
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()))
    fs.rmSync(root, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
