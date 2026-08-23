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
const originalDisableDefaultPlugins = process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS
const originalPluginPaths = process.env.CLAWMAX_PLUGIN_PATHS
process.env.CLAWMAX_ENABLE_TEST_PLUGINS = 'true'
const originalPluginSettingsPath = process.env.CLAWMAX_PLUGIN_SETTINGS_PATH

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
  process.env.CLAWMAX_ENABLED_PLUGINS = 'plugin-guardrails,plugin-evals,plugin-review-notes'
  process.env.CLAWMAX_PLUGIN_PATHS = ''
  process.env.CLAWMAX_PLUGIN_SETTINGS_PATH = path.join(tempHome, 'plugin-settings.json')
  delete process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS
  resetWorkspaceManagerForTests()

  await test('plugin settings routes list and persist the enabled selection', async () => {
    const getHandler = getRouteHandler('get', '/settings')
    const getRes = makeRes()
    await getHandler(makeReq(), getRes)
    assert.strictEqual(getRes.statusCode, 200)
    assert(getRes.jsonBody?.plugins?.some((plugin: any) => plugin.slug === 'clawmax-lifecycle'))

    const putHandler = getRouteHandler('put', '/settings')
    const putRes = makeRes()
    await putHandler(makeReq({ body: { enabledPluginIds: ['clawmax-lifecycle', 'plugin-review-notes'] } }), putRes)
    assert.strictEqual(putRes.statusCode, 200)
    assert.deepStrictEqual(putRes.jsonBody?.plugins?.map((plugin: any) => plugin.slug), ['clawmax-lifecycle', 'plugin-review-notes'])
    assert(fs.existsSync(process.env.CLAWMAX_PLUGIN_SETTINGS_PATH!))
    fs.unlinkSync(process.env.CLAWMAX_PLUGIN_SETTINGS_PATH!)
  })

  await test('plugin settings route rejects unknown plugins', async () => {
    const handler = getRouteHandler('put', '/settings')
    const res = makeRes()
    await handler(makeReq({ body: { enabledPluginIds: ['not-installed'] } }), res)
    assert.strictEqual(res.statusCode, 400)
    assert(String(res.jsonBody?.error).includes('not-installed'))
  })

  await test('plugin index returns empty when default plugins are disabled', async () => {
    const previousEnabled = process.env.CLAWMAX_ENABLED_PLUGINS
    const previousDisableDefaults = process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS
    const previousPluginPaths = process.env.CLAWMAX_PLUGIN_PATHS
    const handler = getRouteHandler('get', '/')
    process.env.CLAWMAX_ENABLED_PLUGINS = ''
    process.env.CLAWMAX_PLUGIN_PATHS = ''
    process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS = 'true'
    const res = makeRes()
    await handler(makeReq(), res)
    assert.strictEqual(res.statusCode, 200, 'Expected plugin index route success without enabled plugins')
    assert.deepStrictEqual(res.jsonBody?.plugins || [], [], 'Expected no plugins to be returned by default')
    if (typeof previousEnabled === 'undefined') delete process.env.CLAWMAX_ENABLED_PLUGINS
    else process.env.CLAWMAX_ENABLED_PLUGINS = previousEnabled
    if (typeof previousDisableDefaults === 'undefined') delete process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS
    else process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS = previousDisableDefaults
    if (typeof previousPluginPaths === 'undefined') delete process.env.CLAWMAX_PLUGIN_PATHS
    else process.env.CLAWMAX_PLUGIN_PATHS = previousPluginPaths
  })

  await test('plugin index lists configured plugins', async () => {
    const handler = getRouteHandler('get', '/')
    process.env.CLAWMAX_ENABLED_PLUGINS = 'plugin-guardrails,plugin-evals,plugin-resource-plans,clawmax-lifecycle,plugin-review-notes'
    process.env.CLAWMAX_PLUGIN_PATHS = ''
    delete process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS
    const res = makeRes()
    await handler(makeReq(), res)

    assert.strictEqual(res.statusCode, 200, 'Expected plugin index route success')
    assert(Array.isArray(res.jsonBody?.plugins), 'Expected plugin list array')
    assert(res.jsonBody.plugins.some((plugin: any) => plugin.slug === 'plugin-guardrails'), 'Expected guardrails test plugin in index')
    assert(res.jsonBody.plugins.some((plugin: any) => plugin.slug === 'plugin-evals'), 'Expected evals test plugin in index')
    assert(res.jsonBody.plugins.some((plugin: any) => plugin.slug === 'plugin-resource-plans'), 'Expected resource-plan fixture in index')
    assert(res.jsonBody.plugins.some((plugin: any) => plugin.slug === 'clawmax-lifecycle'), 'Expected public Lifecycle plugin in index')
    assert(res.jsonBody.plugins.some((plugin: any) => plugin.slug === 'plugin-review-notes'), 'Expected public Review plugin in index')
  })

  await test('plugin diagnostics route reports host compatibility and load status', async () => {
    const handler = getRouteHandler('get', '/diagnostics')
    process.env.CLAWMAX_ENABLED_PLUGINS = 'plugin-review-notes,missing-route-plugin'
    process.env.CLAWMAX_PLUGIN_PATHS = ''
    delete process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS
    const res = makeRes()
    await handler(makeReq(), res)

    assert.strictEqual(res.statusCode, 200, 'Expected plugin diagnostics route success')
    assert.strictEqual(res.jsonBody?.hostApiVersion, 'clawmax.ai/v2', 'Expected host API version')
    assert.strictEqual(res.jsonBody?.healthy, false, 'Expected missing enabled plugin to make diagnostics unhealthy')
    assert(res.jsonBody?.diagnostics?.some((entry: any) => entry.pluginId === 'plugin-review-notes' && entry.status === 'loaded'), 'Expected loaded plugin diagnostic')
    assert.deepStrictEqual(
      res.jsonBody?.diagnostics?.find((entry: any) => entry.pluginId === 'plugin-review-notes')?.capabilities,
      ['docs', 'notifications'],
      'Expected diagnostics to expose granted host capabilities',
    )
    assert(res.jsonBody?.diagnostics?.some((entry: any) => entry.pluginId === 'missing-route-plugin' && entry.status === 'missing'), 'Expected missing plugin diagnostic')
  })

  await test('plugin CRUD and document routes work for guardrails', async () => {
    const createHandler = getRouteHandler('post', '/:pluginId/items')
    process.env.CLAWMAX_ENABLED_PLUGINS = 'plugin-guardrails,plugin-evals'
    process.env.CLAWMAX_PLUGIN_PATHS = ''
    delete process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS
    const createRes = makeRes()
    await createHandler(makeReq({
      params: { pluginId: 'plugin-guardrails' },
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

    const relationshipsHandler = getRouteHandler('get', '/relationships', false)
    const relationshipsRes = makeRes()
    await relationshipsHandler(makeReq(), relationshipsRes)
    assert.strictEqual(relationshipsRes.statusCode, 200, 'Expected plugin relationship route success')
    assert.strictEqual(relationshipsRes.jsonBody?.agents?.analyst?.[0]?.itemId, itemId, 'Expected active guardrail on its targeted agent')
    assert.strictEqual(relationshipsRes.jsonBody?.agents?.analyst?.[0]?.pluginName, 'Guardrails', 'Expected relationship display metadata')
    assert.strictEqual(relationshipsRes.jsonBody?.agents?.analyst?.[0]?.status, 'active', 'Expected active relationship state')

    const updateHandler = getRouteHandler('put', '/:pluginId/items/:itemId', false)
    const updateRes = makeRes()
    await updateHandler(makeReq({
      params: { pluginId: 'plugin-guardrails', itemId },
      body: {
        archived: true,
      },
    }), updateRes)
    assert.strictEqual(updateRes.statusCode, 200, 'Expected plugin item update success')
    assert.strictEqual(updateRes.jsonBody?.item?.archived, true, 'Expected archive flag to persist through update')

    const listHandler = getRouteHandler('get', '/:pluginId/items', false)
    const listRes = makeRes()
    await listHandler(makeReq({ params: { pluginId: 'plugin-guardrails' } }), listRes)
    assert.strictEqual(listRes.jsonBody?.items?.length, 1, 'Expected created plugin item to appear in list')

    const docHandler = getRouteHandler('post', '/:pluginId/items/:itemId/document', false)
    const docRes = makeRes()
    await docHandler(makeReq({ params: { pluginId: 'plugin-guardrails', itemId } }), docRes)
    assert.strictEqual(docRes.statusCode, 200, 'Expected plugin document route success')
    assert(docRes.jsonBody?.item?.document?.path, 'Expected document path in response')
    assert(fs.existsSync(path.join(tempWorkspace, docRes.jsonBody.item.document.path)), 'Expected plugin document written in workspace')
  })

  await test('plugin run route executes eval items and rejects unknown plugins', async () => {
    const createHandler = getRouteHandler('post', '/:pluginId/items')
    process.env.CLAWMAX_ENABLED_PLUGINS = 'plugin-guardrails,plugin-evals'
    process.env.CLAWMAX_PLUGIN_PATHS = ''
    delete process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS
    const createRes = makeRes()
    await createHandler(makeReq({
      params: { pluginId: 'plugin-evals' },
      body: {
        name: 'Summary eval',
        description: 'Basic overlap score',
        target: { type: 'agent', ids: ['analyst'] },
        experiment: {
          input: 'Summarize',
          candidateOutput: 'research summary complete',
          expectedOutput: 'research summary',
          judge: 'fixed',
          fixedMatch: 'contains',
        },
      },
    }), createRes)

    const itemId = createRes.jsonBody?.item?.id
    assert(itemId, 'Expected eval item id')

    const runHandler = getRouteHandler('post', '/:pluginId/items/:itemId/run', false)
    const runRes = makeRes()
    await runHandler(makeReq({ params: { pluginId: 'plugin-evals', itemId } }), runRes)
    assert.strictEqual(runRes.statusCode, 200, 'Expected eval run route success')
    assert((runRes.jsonBody?.item?.lastRun?.score || 0) > 0, 'Expected eval run score in route response')

    const relationshipsHandler = getRouteHandler('get', '/relationships', false)
    const relationshipsRes = makeRes()
    await relationshipsHandler(makeReq(), relationshipsRes)
    const evalRelationship = relationshipsRes.jsonBody?.agents?.analyst?.find((entry: any) => entry.itemId === itemId)
    assert.strictEqual(evalRelationship?.objectKind, 'eval', 'Expected enabled Eval on its targeted agent')
    assert.strictEqual(evalRelationship?.status, '1 run', 'Expected Eval relationship run evidence')

    const missingRes = makeRes()
    await runHandler(makeReq({ params: { pluginId: 'missing-plugin', itemId } }), missingRes)
    assert.strictEqual(missingRes.statusCode, 404, 'Expected unknown plugin to return HTTP 404')
  })

  await test('plugin templates list and apply routes work', async () => {
    const listTemplates = getRouteHandler('get', '/:pluginId/templates', false)
    process.env.CLAWMAX_ENABLED_PLUGINS = 'plugin-guardrails,plugin-evals,plugin-resource-plans'
    process.env.CLAWMAX_PLUGIN_PATHS = ''
    delete process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS
    const templatesRes = makeRes()
    await listTemplates(makeReq({ params: { pluginId: 'plugin-guardrails' } }), templatesRes)
    assert.strictEqual(templatesRes.statusCode, 200, 'Expected template list success')
    assert((templatesRes.jsonBody?.templates || []).length >= 1, 'Expected at least one guardrail template')

    const applyTemplate = getRouteHandler('post', '/:pluginId/templates/:templateId/apply', false)
    const applyRes = makeRes()
    await applyTemplate(makeReq({ params: { pluginId: 'plugin-guardrails', templateId: 'no-outbound-email' } }), applyRes)
    assert.strictEqual(applyRes.statusCode, 201, 'Expected template apply success')
    assert.strictEqual(applyRes.jsonBody?.item?.name, 'No outbound email', 'Expected applied template to create a record')

    const resourcePlanRes = makeRes()
    await applyTemplate(makeReq({ params: { pluginId: 'plugin-resource-plans', templateId: 'workflow-budget' } }), resourcePlanRes)
    assert.strictEqual(
      resourcePlanRes.statusCode,
      201,
      `Expected target-free resource-plan fixture to create an Active plan: ${resourcePlanRes.jsonBody?.error || 'unknown error'}`,
    )
    assert.strictEqual(resourcePlanRes.jsonBody?.item?.fields?.scope, 'workflow', 'Expected resource-plan fields to persist')
    assert.deepStrictEqual(resourcePlanRes.jsonBody?.item?.fields?.targetIds, [], 'Expected target selection to remain available in the editor')
  })

  await test('generic v2 plugin routes validate and persist declarative fields', async () => {
    process.env.CLAWMAX_ENABLED_PLUGINS = 'plugin-review-notes'
    const createHandler = getRouteHandler('post', '/:pluginId/items')
    const invalidRes = makeRes()
    await createHandler(makeReq({
      params: { pluginId: 'plugin-review-notes' },
      body: { name: 'Incomplete', fields: { release: '', area: 'regression', outcome: 'pending' } },
    }), invalidRes)
    assert.strictEqual(invalidRes.statusCode, 400, 'Expected missing required generic field to return HTTP 400')
    assert(/Release is required/.test(invalidRes.jsonBody?.error || ''), 'Expected actionable schema validation message')

    const createRes = makeRes()
    await createHandler(makeReq({
      params: { pluginId: 'plugin-review-notes' },
      body: {
        name: 'Release review',
        fields: {
          release: '2.0.0-test-rc4',
          area: 'regression',
          completed: false,
          outcome: 'pending',
          notes: 'Check the release evidence',
        },
      },
    }), createRes)
    assert.strictEqual(createRes.statusCode, 201, 'Expected generic item create success')
    assert.strictEqual(createRes.jsonBody?.item?.kind, 'review-note', 'Expected generic object kind in response')
    assert.strictEqual(createRes.jsonBody?.item?.fields?.release, '2.0.0-test-rc4', 'Expected release boundary in response')
  })

  await test('plugin routes enforce capability grants and filter context', async () => {
    const pluginRoot = path.join(tempHome, 'no-grants-plugin')
    fs.mkdirSync(pluginRoot, { recursive: true })
    fs.writeFileSync(path.join(pluginRoot, 'clawmax-plugin.json'), JSON.stringify({
      apiVersion: 'clawmax.ai/v2',
      id: 'no-grants',
      slug: 'no-grants',
      name: 'No Grants',
      description: 'Capability enforcement fixture.',
      version: '0.1.0',
      icon: 'plugin',
      objectKind: 'note',
      visibility: 'private',
      source: { type: 'github', owner: 'example', repo: 'no-grants', url: 'https://example.invalid/no-grants' },
      recordSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['notes'],
        properties: { notes: { type: 'string', title: 'Notes' } },
      },
    }, null, 2), 'utf-8')
    process.env.CLAWMAX_PLUGIN_PATHS = pluginRoot
    process.env.CLAWMAX_ENABLED_PLUGINS = 'no-grants'

    const contextHandler = getRouteHandler('get', '/:pluginId/context')
    const contextRes = makeRes()
    await contextHandler(makeReq({ params: { pluginId: 'no-grants' } }), contextRes)
    assert.deepStrictEqual(contextRes.jsonBody?.context, { agents: [], workflows: [], groups: [], communities: [] }, 'Expected filtered context')

    const createHandler = getRouteHandler('post', '/:pluginId/items', false)
    const createRes = makeRes()
    await createHandler(makeReq({ params: { pluginId: 'no-grants' }, body: { name: 'Private', fields: { notes: 'isolated' } } }), createRes)
    const itemId = createRes.jsonBody?.item?.id
    assert(itemId, 'Expected fixture item')

    for (const [route, capability] of [['/:pluginId/items/:itemId/document', 'docs'], ['/:pluginId/items/:itemId/notify', 'notifications']] as const) {
      const handler = getRouteHandler('post', route, false)
      const res = makeRes()
      await handler(makeReq({ params: { pluginId: 'no-grants', itemId } }), res)
      assert.strictEqual(res.statusCode, 403, `Expected ${capability} action to be denied`)
      assert(String(res.jsonBody?.error).includes(`capabilities.${capability}=true`), `Expected actionable ${capability} remediation`)
    }
  })

  if (typeof originalWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
  else process.env.OPENCLAW_WORKSPACE = originalWorkspace
  if (typeof originalHome === 'undefined') delete process.env.HOME
  else process.env.HOME = originalHome
  if (typeof originalTestWorkspace === 'undefined') delete process.env.CLAWMAX_TEST_WORKSPACE
  else process.env.CLAWMAX_TEST_WORKSPACE = originalTestWorkspace
  if (typeof originalEnabledPlugins === 'undefined') delete process.env.CLAWMAX_ENABLED_PLUGINS
  else process.env.CLAWMAX_ENABLED_PLUGINS = originalEnabledPlugins
  if (typeof originalDisableDefaultPlugins === 'undefined') delete process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS
  else process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS = originalDisableDefaultPlugins
  if (typeof originalPluginPaths === 'undefined') delete process.env.CLAWMAX_PLUGIN_PATHS
  else process.env.CLAWMAX_PLUGIN_PATHS = originalPluginPaths
  if (typeof originalPluginSettingsPath === 'undefined') delete process.env.CLAWMAX_PLUGIN_SETTINGS_PATH
  else process.env.CLAWMAX_PLUGIN_SETTINGS_PATH = originalPluginSettingsPath
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
  if (typeof originalDisableDefaultPlugins === 'undefined') delete process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS
  else process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS = originalDisableDefaultPlugins
  if (typeof originalPluginPaths === 'undefined') delete process.env.CLAWMAX_PLUGIN_PATHS
  else process.env.CLAWMAX_PLUGIN_PATHS = originalPluginPaths
  if (typeof originalPluginSettingsPath === 'undefined') delete process.env.CLAWMAX_PLUGIN_SETTINGS_PATH
  else process.env.CLAWMAX_PLUGIN_SETTINGS_PATH = originalPluginSettingsPath
  resetWorkspaceManagerForTests()
  console.error(err)
  process.exit(1)
})
