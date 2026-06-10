/**
 * Plugin routes contract test suite
 *
 * Run with: npx ts-node --transpileOnly server/routes/plugins.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import assert from 'assert'
import { resetWorkspaceManagerForTests } from '../lib/workspace-manager'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

const originalWorkspace = process.env.OPENCLAW_WORKSPACE
const originalHome = process.env.HOME
const originalTestWorkspace = process.env.CLAWMAX_TEST_WORKSPACE
const originalEnabledPlugins = process.env.CLAWMAX_ENABLED_PLUGINS

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

function getRouter(reset = true) {
  if (reset) {
    resetWorkspaceManagerForTests()
    delete require.cache[require.resolve('./plugins')]
  }
  return require('./plugins').default
}

function getRouteHandler(method: 'get' | 'post' | 'put' | 'delete', routePath: string, reset = true) {
  const router = getRouter(reset)
  const layer = router.stack.find((entry: any) => entry.route?.path === routePath && entry.route?.methods?.[method])
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${routePath} not found`)
  return layer.route.stack[0].handle as Function
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
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(body: any) {
      this.jsonBody = body
      return this
    },
  }
}

async function run() {
  console.log(`\n${YELLOW}=== Plugin Routes Contract Suite ===${RESET}\n`)

  const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-plugin-routes-workspace-'))
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-plugin-routes-home-'))

  process.env.OPENCLAW_WORKSPACE = tempWorkspace
  process.env.CLAWMAX_TEST_WORKSPACE = tempWorkspace
  process.env.HOME = tempHome
  process.env.CLAWMAX_ENABLED_PLUGINS = 'plugin-lab-guardrails,plugin-lab-evals'
  resetWorkspaceManagerForTests()

  await test('plugin index lists configured plugins', async () => {
    const handler = getRouteHandler('get', '/')
    const res = makeRes()
    await handler(makeReq(), res)

    assert.strictEqual(res.statusCode, 200, 'Expected plugin index route success')
    assert(Array.isArray(res.jsonBody?.plugins), 'Expected plugin list array')
    assert(res.jsonBody.plugins.some((plugin: any) => plugin.slug === 'plugin-lab-guardrails'), 'Expected guardrails plugin in index')
    assert(res.jsonBody.plugins.some((plugin: any) => plugin.slug === 'plugin-lab-evals'), 'Expected evals plugin in index')
  })

  await test('plugin CRUD and document routes work for guardrails', async () => {
    const createHandler = getRouteHandler('post', '/:pluginId/items')
    const createRes = makeRes()
    await createHandler(makeReq({
      params: { pluginId: 'plugin-lab-guardrails' },
      body: {
        name: 'No outbound send',
        description: 'Prevent external sends',
        tags: ['security'],
        appliesTo: { agents: ['analyst'], workflows: [], groups: [], communities: [] },
        controls: { blockEmail: true, blockWeb: false, blockExternalDocs: true, allowedSkills: ['workspace-ls'] },
      },
    }), createRes)

    assert.strictEqual(createRes.statusCode, 201, 'Expected plugin item create to return HTTP 201')
    const itemId = createRes.jsonBody?.item?.id
    assert(itemId, 'Expected created plugin item id')

    const listHandler = getRouteHandler('get', '/:pluginId/items', false)
    const listRes = makeRes()
    await listHandler(makeReq({ params: { pluginId: 'plugin-lab-guardrails' } }), listRes)
    assert.strictEqual(listRes.jsonBody?.items?.length, 1, 'Expected created plugin item to appear in list')

    const docHandler = getRouteHandler('post', '/:pluginId/items/:itemId/document', false)
    const docRes = makeRes()
    await docHandler(makeReq({ params: { pluginId: 'plugin-lab-guardrails', itemId } }), docRes)
    assert.strictEqual(docRes.statusCode, 200, 'Expected plugin document route success')
    assert(docRes.jsonBody?.item?.document?.path, 'Expected document path in response')
    assert(fs.existsSync(path.join(tempWorkspace, docRes.jsonBody.item.document.path)), 'Expected plugin document written in workspace')
  })

  await test('plugin run route executes eval items and rejects unknown plugins', async () => {
    const createHandler = getRouteHandler('post', '/:pluginId/items')
    const createRes = makeRes()
    await createHandler(makeReq({
      params: { pluginId: 'plugin-lab-evals' },
      body: {
        name: 'Summary eval',
        description: 'Basic overlap score',
        target: { type: 'agent', ids: ['analyst'] },
        experiment: {
          input: 'Summarize',
          candidateOutput: 'research summary complete',
          expectedOutput: 'research summary',
          judge: 'fixed',
        },
      },
    }), createRes)

    const itemId = createRes.jsonBody?.item?.id
    assert(itemId, 'Expected eval item id')

    const runHandler = getRouteHandler('post', '/:pluginId/items/:itemId/run', false)
    const runRes = makeRes()
    await runHandler(makeReq({ params: { pluginId: 'plugin-lab-evals', itemId } }), runRes)
    assert.strictEqual(runRes.statusCode, 200, 'Expected eval run route success')
    assert((runRes.jsonBody?.item?.lastRun?.score || 0) > 0, 'Expected eval run score in route response')

    const missingRes = makeRes()
    await runHandler(makeReq({ params: { pluginId: 'missing-plugin', itemId } }), missingRes)
    assert.strictEqual(missingRes.statusCode, 404, 'Expected unknown plugin to return HTTP 404')
  })

  await test('plugin templates list and apply routes work', async () => {
    const listTemplates = getRouteHandler('get', '/:pluginId/templates', false)
    const templatesRes = makeRes()
    await listTemplates(makeReq({ params: { pluginId: 'plugin-lab-guardrails' } }), templatesRes)
    assert.strictEqual(templatesRes.statusCode, 200, 'Expected template list success')
    assert((templatesRes.jsonBody?.templates || []).length >= 1, 'Expected at least one guardrail template')

    const applyTemplate = getRouteHandler('post', '/:pluginId/templates/:templateId/apply', false)
    const applyRes = makeRes()
    await applyTemplate(makeReq({ params: { pluginId: 'plugin-lab-guardrails', templateId: 'no-outbound-email' } }), applyRes)
    assert.strictEqual(applyRes.statusCode, 201, 'Expected template apply success')
    assert.strictEqual(applyRes.jsonBody?.item?.name, 'No outbound email', 'Expected applied template to create a record')
  })

  if (typeof originalWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
  else process.env.OPENCLAW_WORKSPACE = originalWorkspace
  if (typeof originalHome === 'undefined') delete process.env.HOME
  else process.env.HOME = originalHome
  if (typeof originalTestWorkspace === 'undefined') delete process.env.CLAWMAX_TEST_WORKSPACE
  else process.env.CLAWMAX_TEST_WORKSPACE = originalTestWorkspace
  if (typeof originalEnabledPlugins === 'undefined') delete process.env.CLAWMAX_ENABLED_PLUGINS
  else process.env.CLAWMAX_ENABLED_PLUGINS = originalEnabledPlugins
  resetWorkspaceManagerForTests()
  fs.rmSync(tempWorkspace, { recursive: true, force: true })
  fs.rmSync(tempHome, { recursive: true, force: true })

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
  if (typeof originalWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
  else process.env.OPENCLAW_WORKSPACE = originalWorkspace
  if (typeof originalHome === 'undefined') delete process.env.HOME
  else process.env.HOME = originalHome
  if (typeof originalTestWorkspace === 'undefined') delete process.env.CLAWMAX_TEST_WORKSPACE
  else process.env.CLAWMAX_TEST_WORKSPACE = originalTestWorkspace
  if (typeof originalEnabledPlugins === 'undefined') delete process.env.CLAWMAX_ENABLED_PLUGINS
  else process.env.CLAWMAX_ENABLED_PLUGINS = originalEnabledPlugins
  resetWorkspaceManagerForTests()
  console.error(err)
  process.exit(1)
})
