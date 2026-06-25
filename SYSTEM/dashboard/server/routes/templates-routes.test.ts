/**
 * Template route contract tests
 *
 * Run with: npx ts-node --transpileOnly server/routes/templates-routes.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import assert from 'assert'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

const originalHome = process.env.HOME
const originalWorkspace = process.env.OPENCLAW_WORKSPACE

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`${GREEN}✓${RESET} ${name}`)
      testsPassed++
    })
    .catch((err: any) => {
      console.log(`${RED}✗${RESET} ${name}`)
      console.error(`  Error: ${err.message}`)
      testsFailed++
    })
}

function ensureWorkspaceScaffold(workspacePath: string) {
  fs.mkdirSync(path.join(workspacePath, 'AGENTS'), { recursive: true })
  fs.mkdirSync(path.join(workspacePath, 'ORG'), { recursive: true })
  fs.mkdirSync(path.join(workspacePath, 'SYSTEM'), { recursive: true })
  fs.mkdirSync(path.join(workspacePath, 'WORKFLOWS'), { recursive: true })
  fs.writeFileSync(path.join(workspacePath, 'ORG', 'COMMUNITIES.md'), '# Communities\n\n## Communities\n\n', 'utf-8')
  fs.writeFileSync(path.join(workspacePath, 'ORG', 'GROUPS.md'), '# Groups\n\n## Groups\n\n', 'utf-8')
}

function writeWorkspaceRegistry(tmpHome: string, workspacePath: string) {
  const registryPath = path.join(tmpHome, '.openclaw', 'dashboard-workspaces.json')
  fs.mkdirSync(path.dirname(registryPath), { recursive: true })
  fs.writeFileSync(registryPath, JSON.stringify({
    version: '1.0.0',
    activeWorkspaceId: 'template-workspace',
    workspaces: [{
      id: 'template-workspace',
      name: 'Template Workspace',
      path: workspacePath,
      createdAt: '2026-06-01T00:00:00.000Z',
      lastAccessedAt: '2026-06-01T00:00:00.000Z',
      color: '#3B82F6',
      tags: [],
    }],
  }, null, 2))
}

function getRouteHandler(method: 'get' | 'post' | 'put' | 'delete', routePath: string) {
  delete require.cache[require.resolve('./templates')]
  const router = require('./templates').default
  const layer = router.stack.find((entry: any) => entry.route?.path === routePath && entry.route?.methods?.[method])
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${routePath} not found`)
  return layer.route.stack[layer.route.stack.length - 1].handle as Function
}

function makeReq(overrides: Record<string, any> = {}) {
  return {
    params: {},
    query: {},
    body: {},
    ...overrides,
  } as any
}

function makeRes() {
  return {
    statusCode: 200,
    jsonBody: undefined as any,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code
      return this
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value
      return this
    },
    json(body: any) {
      this.jsonBody = body
      return this
    },
    send(body: any) {
      this.jsonBody = body
      return this
    },
  }
}

async function run() {
  console.log(`\n${YELLOW}=== Template Routes Test Suite ===${RESET}\n`)

  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-template-routes-home-'))
  const tmpWorkspace = path.join(tmpHome, 'workspaces', 'template-workspace')
  ensureWorkspaceScaffold(tmpWorkspace)
  writeWorkspaceRegistry(tmpHome, tmpWorkspace)
  fs.mkdirSync(path.join(tmpHome, '.openclaw', 'agents'), { recursive: true })
  fs.writeFileSync(path.join(tmpHome, '.openclaw', 'openclaw.json'), JSON.stringify({ agents: { list: [] } }, null, 2))

  process.env.HOME = tmpHome
  process.env.OPENCLAW_WORKSPACE = tmpWorkspace

  await test('organization prereqs rejects missing template slug', async () => {
    const handler = getRouteHandler('post', '/organizations/prereqs')
    const res = makeRes()
    await handler(makeReq({ body: {} }), res)

    assert.strictEqual(res.statusCode, 400, 'Expected missing slug to return HTTP 400')
    assert(/templateslug is required/i.test(res.jsonBody?.error || ''), 'Expected missing template slug guidance')
  })

  await test('organization prereqs returns 404 for unknown templates', async () => {
    const handler = getRouteHandler('post', '/organizations/prereqs')
    const res = makeRes()
    await handler(makeReq({ body: { templateSlug: 'missing-template' } }), res)

    assert.strictEqual(res.statusCode, 404, 'Expected unknown slug to return HTTP 404')
    assert(/template not found/i.test(res.jsonBody?.error || ''), 'Expected template not found guidance')
  })

  await test('organization conflicts expands parameterized agent ids and reports group/community conflicts', async () => {
    fs.mkdirSync(path.join(tmpWorkspace, 'AGENTS', 'event-analyst1'), { recursive: true })
    fs.writeFileSync(path.join(tmpWorkspace, 'AGENTS', 'event-analyst1', 'IDENTITY.md'), [
      '# IDENTITY.md',
      '**Name:** Event Analyst 1',
      '**Role:** Existing analyst',
    ].join('\n'), 'utf-8')
    fs.writeFileSync(path.join(tmpWorkspace, 'ORG', 'COMMUNITIES.md'), [
      '# Communities',
      '',
      '## Communities',
      '',
      '### Lu.ma Analysis',
      'Description: Existing analysis community',
      '',
    ].join('\n'), 'utf-8')
    fs.writeFileSync(path.join(tmpWorkspace, 'ORG', 'GROUPS.md'), [
      '# Groups',
      '',
      '## Groups',
      '',
      '### Events',
      'Description: Existing events group',
      'Community: Lu.ma Analysis',
      '',
    ].join('\n'), 'utf-8')

    const handler = getRouteHandler('post', '/organizations/conflicts')
    const res = makeRes()
    await handler(makeReq({
      body: {
        templateSlug: 'lu-ma-event-analysis-desk',
        agentCounts: { 'event-analyst': 2 },
      },
    }), res)

    assert.strictEqual(res.statusCode, 200, 'Expected conflicts route success')
    assert.strictEqual(res.jsonBody?.ok, true, 'Expected ok response')
    assert(res.jsonBody?.agentConflicts?.includes('event-analyst1'), 'Expected expanded event-analyst1 conflict')
    assert(res.jsonBody?.groupConflicts?.includes('Events'), 'Expected existing Events group conflict')
    assert(res.jsonBody?.communityConflicts?.includes('Lu.ma Analysis'), 'Expected existing Lu.ma Analysis community conflict')
  })

  await test('organization conflicts respects prefix overrides when checking parameterized agents', async () => {
    const handler = getRouteHandler('post', '/organizations/conflicts')
    const res = makeRes()
    await handler(makeReq({
      body: {
        templateSlug: 'lu-ma-event-analysis-desk',
        prefix: 'demo-',
        agentCounts: { 'event-analyst': 2 },
      },
    }), res)

    assert.strictEqual(res.statusCode, 200, 'Expected conflicts route success')
    assert.strictEqual(res.jsonBody?.agentConflicts?.includes('demo-event-analyst1'), false, 'Expected prefix to avoid the existing agent conflict')
  })

  await test('template list route rejects invalid type filters', async () => {
    const handler = getRouteHandler('get', '/')
    const res = makeRes()
    await handler(makeReq({ query: { type: 'bad-type' } }), res)

    assert.strictEqual(res.statusCode, 400, 'Expected invalid type filter to return HTTP 400')
    assert(/Type must be/i.test(res.jsonBody?.error || ''), 'Expected invalid type guidance')
  })

  await test('template detail route rejects invalid type segments', async () => {
    const handler = getRouteHandler('get', '/:type/:slug')
    const res = makeRes()
    await handler(makeReq({ params: { type: 'bad-type', slug: 'anything' } }), res)

    assert.strictEqual(res.statusCode, 400, 'Expected invalid type segment to return HTTP 400')
    assert(/Type must be/i.test(res.jsonBody?.error || ''), 'Expected invalid type segment guidance')
  })

  await test('template feedback route rejects invalid ratings before saving', async () => {
    const handler = getRouteHandler('post', '/:type/:slug/feedback')
    const res = makeRes()
    await handler(makeReq({
      params: { type: 'organizations', slug: 'lu-ma-event-analysis-desk' },
      body: { rating: 9 },
    }), res)

    assert.strictEqual(res.statusCode, 400, 'Expected invalid rating to return HTTP 400')
    assert(/Rating must be between 1 and 5/i.test(res.jsonBody?.error || ''), 'Expected rating validation guidance')
  })

  await test('save agent template route rejects invalid agent ids', async () => {
    const handler = getRouteHandler('post', '/agents/:agentId/save')
    const res = makeRes()
    await handler(makeReq({
      params: { agentId: 'BAD ID' },
      body: { name: 'Agent Template' },
    }), res)

    assert.strictEqual(res.statusCode, 400, 'Expected invalid agent id to return HTTP 400')
    assert(/Invalid agent ID/i.test(res.jsonBody?.error || ''), 'Expected invalid agent id guidance')
  })

  await test('template put route rejects missing bodies and mismatched template types', async () => {
    const handler = getRouteHandler('put', '/:type/:slug')

    const missingBodyRes = makeRes()
    await handler(makeReq({ params: { type: 'agents', slug: 'demo-template' }, body: null }), missingBodyRes)
    assert.strictEqual(missingBodyRes.statusCode, 400, 'Expected missing template body to return HTTP 400')
    assert(/Template body is required/i.test(missingBodyRes.jsonBody?.error || ''), 'Expected missing body guidance')

    const typeMismatchRes = makeRes()
    await handler(makeReq({
      params: { type: 'agents', slug: 'demo-template' },
      body: { type: 'organization', name: 'Demo Template' },
    }), typeMismatchRes)
    assert.strictEqual(typeMismatchRes.statusCode, 400, 'Expected template type mismatch to return HTTP 400')
    assert(/Template body type must be "agent"/i.test(typeMismatchRes.jsonBody?.error || ''), 'Expected type mismatch guidance')
  })

  await test('agent template files route returns 404 for unknown templates', async () => {
    const handler = getRouteHandler('get', '/agents/:slug/files')
    const res = makeRes()
    await handler(makeReq({ params: { slug: 'missing-template' } }), res)

    assert.strictEqual(res.statusCode, 404, 'Expected unknown agent template files request to return HTTP 404')
    assert(/Template not found/i.test(res.jsonBody?.error || ''), 'Expected missing template files guidance')
  })

  await test('template validate route rejects invalid template bodies', async () => {
    const handler = getRouteHandler('post', '/validate')
    const res = makeRes()
    await handler(makeReq({ body: { type: 'organization', name: '' } }), res)

    assert.strictEqual(res.statusCode, 400, 'Expected invalid template validation to return HTTP 400')
    assert.strictEqual(res.jsonBody?.valid, false, 'Expected invalid validation payload')
    assert(Array.isArray(res.jsonBody?.errors) && res.jsonBody.errors.length > 0, 'Expected validation errors')
  })

  await test('template generate route rejects missing descriptions', async () => {
    const handler = getRouteHandler('post', '/generate')
    const res = makeRes()
    await handler(makeReq({ body: {} }), res)

    assert.strictEqual(res.statusCode, 400, 'Expected missing generate description to return HTTP 400')
    assert(/description is required/i.test(res.jsonBody?.error || ''), 'Expected missing generate description guidance')
  })

  await test('template agent import route rejects missing template slug', async () => {
    const handler = getRouteHandler('post', '/agents/import')
    const res = makeRes()
    await handler(makeReq({ body: {} }), res)

    assert.strictEqual(res.statusCode, 400, 'Expected missing agent import template slug to return HTTP 400')
    assert(/Template slug is required/i.test(res.jsonBody?.error || ''), 'Expected missing agent import slug guidance')
  })

  await test('organization customization and import routes reject missing template slugs', async () => {
    const customizeHandler = getRouteHandler('post', '/organizations/validate-customization')
    let res = makeRes()
    await customizeHandler(makeReq({ body: {} }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected missing template slug for customization validation to return HTTP 400')

    const importHandler = getRouteHandler('post', '/organizations/import')
    res = makeRes()
    await importHandler(makeReq({ body: {} }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected missing organization import template slug to return HTTP 400')
  })

  await test('template markdown import routes validate required content', async () => {
    const templateImportHandler = getRouteHandler('post', '/import-md')
    let res = makeRes()
    await templateImportHandler(makeReq({ body: {} }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected missing template markdown content to return HTTP 400')

    const workflowImportHandler = getRouteHandler('post', '/workflows/import-md')
    res = makeRes()
    await workflowImportHandler(makeReq({ body: {} }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected missing workflow markdown content to return HTTP 400')
  })

  await test('template export routes reject invalid template types and missing workflows', async () => {
    const templateExportHandler = getRouteHandler('get', '/:type/:slug/export-md')
    let res = makeRes()
    await templateExportHandler(makeReq({ params: { type: 'bad-type', slug: 'anything' } }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected invalid template export type to return HTTP 400')

    const workflowExportHandler = getRouteHandler('get', '/workflows/:id/export-md')
    res = makeRes()
    await workflowExportHandler(makeReq({ params: { id: 'missing-workflow' } }), res)
    assert.strictEqual(res.statusCode, 404, 'Expected missing workflow export to return HTTP 404')
  })

  if (typeof originalHome === 'undefined') delete process.env.HOME
  else process.env.HOME = originalHome
  if (typeof originalWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
  else process.env.OPENCLAW_WORKSPACE = originalWorkspace

  console.log('\n========================================')
  console.log(`Tests passed: ${testsPassed}`)
  console.log(`Tests failed: ${testsFailed}`)
  console.log('========================================\n')

  if (testsFailed > 0) {
    console.log(`${RED}Some tests failed${RESET}`)
    process.exit(1)
  } else {
    console.log(`${GREEN}All tests passed${RESET}`)
  }
}

run().catch((err) => {
  if (typeof originalHome === 'undefined') delete process.env.HOME
  else process.env.HOME = originalHome
  if (typeof originalWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
  else process.env.OPENCLAW_WORKSPACE = originalWorkspace
  console.error(err)
  process.exit(1)
})
