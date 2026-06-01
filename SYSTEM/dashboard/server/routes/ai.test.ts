/**
 * AI routes test suite
 *
 * Run with: npx ts-node --transpileOnly server/routes/ai.test.ts
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

function loadRouterWithOverrides(overrides: Partial<typeof import('../lib/ai-generator')> = {}) {
  const libPath = require.resolve('../lib/ai-generator')
  delete require.cache[libPath]
  const lib = require(libPath)
  Object.assign(lib, overrides)

  const routePath = require.resolve('./ai')
  delete require.cache[routePath]
  return require(routePath).default
}

function getRouteHandler(router: any, method: 'post', routePath: string) {
  const layer = router.stack.find((entry: any) => entry.route?.path === routePath && entry.route?.methods?.[method])
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${routePath} not found`)
  return layer.route.stack[layer.route.stack.length - 1].handle as Function
}

function makeReq(overrides: Record<string, any> = {}) {
  return {
    params: {},
    query: {},
    body: {},
    headers: {},
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
  console.log(`\n${YELLOW}=== AI Routes Test Suite ===${RESET}\n`)

  await test('expand-prompt requires a non-empty prompt', async () => {
    const router = loadRouterWithOverrides()
    const handler = getRouteHandler(router, 'post', '/expand-prompt')
    const res = makeRes()
    await handler(makeReq({ body: {} }), res)

    assert.strictEqual(res.statusCode, 400, 'Expected missing prompt to return HTTP 400')
    assert.strictEqual(res.jsonBody?.error, 'prompt is required', 'Expected missing prompt guidance')
  })

  await test('expand-prompt returns expanded prompt when AI helper succeeds', async () => {
    const router = loadRouterWithOverrides({
      expandPromptWithAI: async () => 'Expanded prompt result',
    } as any)
    const handler = getRouteHandler(router, 'post', '/expand-prompt')
    const res = makeRes()
    await handler(makeReq({
      body: {
        prompt: 'make this better',
        target: 'skill',
        format: 'markdown',
      },
    }), res)

    assert.strictEqual(res.statusCode, 200, 'Expected expand-prompt success')
    assert.strictEqual(res.jsonBody?.ok, true, 'Expected ok expand-prompt response')
    assert.strictEqual(res.jsonBody?.expandedPrompt, 'Expanded prompt result', 'Expected expanded prompt payload')
  })

  await test('expand-prompt maps missing AI credentials to HTTP 400', async () => {
    const router = loadRouterWithOverrides({
      expandPromptWithAI: async () => {
        throw new Error('No API key configured for AI generation')
      },
    } as any)
    const handler = getRouteHandler(router, 'post', '/expand-prompt')
    const res = makeRes()
    await handler(makeReq({ body: { prompt: 'hello' } }), res)

    assert.strictEqual(res.statusCode, 400, 'Expected missing AI credentials to return HTTP 400')
    assert(/AI prompt expansion needs/i.test(res.jsonBody?.error || ''), 'Expected AI credential guidance')
  })

  await test('expand-prompt maps invalid developer credentials to HTTP 400', async () => {
    const router = loadRouterWithOverrides({
      expandPromptWithAI: async () => {
        throw new Error('developer API key does not look like a valid credential')
      },
    } as any)
    const handler = getRouteHandler(router, 'post', '/expand-prompt')
    const res = makeRes()
    await handler(makeReq({ body: { prompt: 'hello' } }), res)

    assert.strictEqual(res.statusCode, 400, 'Expected invalid developer credentials to return HTTP 400')
    assert(/developer API key/i.test(res.jsonBody?.error || ''), 'Expected invalid credential guidance')
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
