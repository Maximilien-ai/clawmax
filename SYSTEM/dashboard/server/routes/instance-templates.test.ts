import assert from 'assert'
import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import express from 'express'
import { createInstanceTemplatesRouter, TEMPLATE_MEDIA_TYPE } from './instance-templates'
import { templateFixture } from '../lib/portable-template.test'
import { sha256 } from '../lib/portable-template'
import { InstanceTemplateCatalog } from '../lib/instance-template-catalog'

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-template-api-'))
  const workspacePath = path.join(root, 'workspace')
  const app = express()
  app.use(express.json())
  app.use('/api/cli/v1/workspaces/:workspaceId', createInstanceTemplatesRouter({
    authorize: (req, res) => {
      const status = req.get('Authorization') !== 'Bearer synthetic-test-token' ? 401 : req.params.workspaceId !== 'owned' ? 403 : 200
      if (status !== 200) { res.status(status).json({ kind: 'Error' }); return null }
      return { workspaceId: 'owned', workspacePath, actorId: 'actor' }
    }, dashboardVersion: () => 'source-test', openClawVersion: () => 'test',
  }))
  app.use((_req, res) => res.status(404).json({ kind: 'Error', error: { code: 'route_not_found' } }))
  const server = http.createServer(app)
  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    const address = server.address() as { port: number }
    const base = `http://127.0.0.1:${address.port}/api/cli/v1/workspaces`
    const bytes = await templateFixture()
    const headers = { Authorization: 'Bearer synthetic-test-token', 'Content-Type': TEMPLATE_MEDIA_TYPE, 'X-ClawMax-Template-Key': 'stability', 'X-ClawMax-Template-Version': '1.0.0', 'X-ClawMax-Template-SHA256': sha256(bytes), 'Idempotency-Key': 'import-1' }
    const call = async (endpoint: string, method = 'GET', body?: Buffer, overrides = {}) => {
      const response = await fetch(`${base}/${endpoint}`, { method, headers: { ...headers, ...overrides }, ...(body ? { body: new Uint8Array(body) } : {}) })
      assert(response.headers.get('content-type')?.includes('application/json'))
      return { status: response.status, body: await response.json() as any }
    }
    assert.equal((await call('owned/capabilities', 'GET', undefined, { Authorization: '' })).status, 401)
    assert.equal((await call('other/templates', 'POST', bytes)).status, 403)
    const caps = await call('owned/capabilities')
    assert.equal(caps.status, 200)
    assert.deepEqual(caps.body.templates.operations, ['import', 'list', 'remove', 'show', 'validate', 'versions'])
    assert(!caps.body.templates.operations.includes('apply'))
    const validation = await call('owned/template-validations', 'POST', bytes)
    assert.equal(validation.status, 200)
    assert.equal(validation.body.artifactCount, 4)
    assert(!fs.existsSync(workspacePath), 'Validation must not create workspace/catalog files')
    assert.equal((await call('owned/template-validations', 'POST', bytes, { 'X-ClawMax-Template-SHA256': '0'.repeat(64) })).status, 400)
    assert.equal((await call('owned/template-validations', 'POST', bytes, { 'Content-Type': 'application/octet-stream' })).status, 415)
    assert.equal((await call('owned/templates', 'POST', bytes, { 'Idempotency-Key': '' })).status, 400)
    const imported = await call('owned/templates', 'POST', bytes)
    assert.equal(imported.status, 201)
    const template = imported.body.template
    assert.equal(template.workspaceId, 'owned')
    const replay = await call('owned/templates', 'POST', bytes)
    assert.equal(replay.status, 200); assert.deepEqual(replay.body.template, template)
    const freshKey = await call('owned/templates', 'POST', bytes, { 'Idempotency-Key': 'import-2' })
    assert.equal(freshKey.status, 200); assert.equal(freshKey.body.template.id, template.id)
    const changed = await templateFixture((_files, manifest) => { manifest.name = 'Changed' })
    assert.equal((await call('owned/templates', 'POST', changed, { 'X-ClawMax-Template-SHA256': sha256(changed) })).status, 409)
    assert.equal((await call('owned/templates', 'POST', changed, { 'Idempotency-Key': 'new-key', 'X-ClawMax-Template-SHA256': sha256(changed) })).status, 409)
    assert.deepEqual((await call(`owned/templates/${template.id}`)).body.template, template)
    assert.deepEqual((await call('owned/templates')).body.items, [template])
    const reopened = new InstanceTemplateCatalog(workspacePath, 'owned')
    assert.deepEqual(reopened.get(template.id), template)
    assert.equal((await reopened.bundle(template.id)).artifacts.length, 4)
    for (const version of ['1.2.0', '1.10.0']) {
      const next = await templateFixture((_files, manifest) => { manifest.version = version })
      assert.equal((await call('owned/templates', 'POST', next, { 'Idempotency-Key': `version-${version}`, 'X-ClawMax-Template-Version': version, 'X-ClawMax-Template-SHA256': sha256(next) })).status, 201)
    }
    assert.deepEqual((await call('owned/template-keys/stability/versions')).body.items.map((item: any) => item.version), ['1.10.0', '1.2.0', '1.0.0'])
    const unrelated = path.join(workspacePath, 'AGENTS', 'unrelated')
    fs.mkdirSync(unrelated, { recursive: true }); fs.writeFileSync(path.join(unrelated, 'IDENTITY.md'), 'preserve')
    assert.equal((await call(`owned/templates/${template.id}`, 'DELETE')).body.removed, true)
    assert.equal((await call(`owned/templates/${template.id}`, 'DELETE')).body.removed, false)
    assert.equal((await call('owned/templates/unknown', 'DELETE')).body.removed, false)
    assert.equal(fs.readFileSync(path.join(unrelated, 'IDENTITY.md'), 'utf8'), 'preserve')
    assert.equal((await call(`owned/templates/${template.id}`)).status, 404)
    assert.equal((await call('owned/templates', 'POST', bytes)).status, 409)
    assert.equal((await call('owned/not-implemented')).status, 404)
    fs.writeFileSync(path.join(reopened.root, 'catalog.json'), '{broken')
    const corrupt = await call('owned/templates')
    assert.equal(corrupt.status, 503)
    assert(!JSON.stringify(corrupt.body).includes(root))
    console.log('instance-templates.test.ts: passed')
  } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    fs.rmSync(root, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
