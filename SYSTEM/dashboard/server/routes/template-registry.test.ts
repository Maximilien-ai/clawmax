/**
 * Template registry routes test suite
 *
 * Run with: npx ts-node --transpileOnly server/routes/template-registry.test.ts
 */

import assert from 'assert'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

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

function loadRouterWithOverrides(overrides: Partial<typeof import('../lib/template-registry')> = {}) {
  const libPath = require.resolve('../lib/template-registry')
  delete require.cache[libPath]
  const lib = require(libPath)
  Object.assign(lib, overrides)

  const routePath = require.resolve('./template-registry')
  delete require.cache[routePath]
  return require(routePath).default
}

function getRouteHandler(router: any, method: 'get' | 'post', routePath: string) {
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
  console.log(`\n${YELLOW}=== Template Registry Routes Test Suite ===${RESET}\n`)

  await test('catalog route returns write-enabled flag from the registry helper', async () => {
    const router = loadRouterWithOverrides({
      fetchTemplateRegistryCatalog: async () => ({ templates: [{ slug: 'demo-template' }] }),
      isTemplateRegistryWriteEnabled: () => true,
    } as any)
    const handler = getRouteHandler(router, 'get', '/')
    const res = makeRes()
    await handler(makeReq(), res)

    assert.strictEqual(res.statusCode, 200, 'Expected catalog route success')
    assert.strictEqual(res.jsonBody?.dashboardWriteEnabled, true, 'Expected dashboard write-enabled flag')
    assert.strictEqual((res.jsonBody?.templates || []).length, 1, 'Expected stub catalog payload')
  })

  await test('import route validates required fields before import helper runs', async () => {
    const router = loadRouterWithOverrides()
    const handler = getRouteHandler(router, 'post', '/import')
    const res = makeRes()
    await handler(makeReq({ body: { title: 'Only title' } }), res)

    assert.strictEqual(res.statusCode, 400, 'Expected missing import fields to return HTTP 400')
    assert(/title, templateSlug, templateType, and sourceUrl are required/i.test(res.jsonBody?.error || ''), 'Expected import validation guidance')
  })

  await test('rate route maps registry auth/config errors to stable HTTP codes', async () => {
    const errorCases: Array<[string, number]> = [
      ['not configured', 503],
      ['invalid or expired token', 401],
      ['does not match the current deployment or customer', 403],
      ['rate limit exceeded', 429],
      ['generic failure', 400],
    ]

    for (const [message, expectedStatus] of errorCases) {
      const router = loadRouterWithOverrides({
        postTemplateRegistryAction: async () => {
          throw new Error(message)
        },
      } as any)
      const handler = getRouteHandler(router, 'post', '/rate')
      const res = makeRes()
      await handler(makeReq({ body: { rating: 5 } }), res)
      assert.strictEqual(res.statusCode, expectedStatus, `Expected "${message}" to map to HTTP ${expectedStatus}`)
    }
  })

  await test('share route maps registry auth/config errors to stable HTTP codes', async () => {
    const errorCases: Array<[string, number]> = [
      ['not configured', 503],
      ['invalid or expired token', 401],
      ['does not match the current deployment or customer', 403],
      ['rate limit exceeded', 429],
      ['generic failure', 400],
    ]

    for (const [message, expectedStatus] of errorCases) {
      const router = loadRouterWithOverrides({
        postTemplateRegistryAction: async () => {
          throw new Error(message)
        },
      } as any)
      const handler = getRouteHandler(router, 'post', '/share')
      const res = makeRes()
      await handler(makeReq({ body: { slug: 'demo-template' } }), res)
      assert.strictEqual(res.statusCode, expectedStatus, `Expected "${message}" to map to HTTP ${expectedStatus}`)
    }
  })

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
  console.error(err)
  process.exit(1)
})
