/**
 * AI Builder routes test suite
 *
 * Run with: npx ts-node --transpileOnly server/routes/ai-builder.test.ts
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

function loadRouterWithOverrides(overrides: {
  aiBuilder?: Record<string, any>
  aiGenerator?: Record<string, any>
  aiBuilderShare?: Record<string, any>
} = {}) {
  const aiBuilderPath = require.resolve('../lib/ai-builder')
  delete require.cache[aiBuilderPath]
  Object.assign(require(aiBuilderPath), overrides.aiBuilder || {})

  const aiGeneratorPath = require.resolve('../lib/ai-generator')
  delete require.cache[aiGeneratorPath]
  Object.assign(require(aiGeneratorPath), overrides.aiGenerator || {})

  const aiBuilderSharePath = require.resolve('../lib/ai-builder-share')
  delete require.cache[aiBuilderSharePath]
  Object.assign(require(aiBuilderSharePath), overrides.aiBuilderShare || {})

  const routePath = require.resolve('./ai-builder')
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
  console.log(`\n${YELLOW}=== AI Builder Routes Test Suite ===${RESET}\n`)

  await test('recommend route requires a non-empty prompt', async () => {
    const router = loadRouterWithOverrides()
    const handler = getRouteHandler(router, 'post', '/recommend')
    const res = makeRes()
    await handler(makeReq({ body: {} }), res)

    assert.strictEqual(res.statusCode, 400, 'Expected missing prompt to return HTTP 400')
    assert.strictEqual(res.jsonBody?.error, 'Prompt is required', 'Expected missing prompt guidance')
  })

  await test('recommend route returns deterministic recommendation when fallback is skipped', async () => {
    const router = loadRouterWithOverrides({
      aiBuilder: {
        buildAiBuilderRecommendation: () => ({
          summary: 'Use a team template',
          intent: 'create',
          scope: 'team',
          operation: 'create',
          confidence: 'high',
          matchedAssets: { organizationTemplates: [], agentTemplates: [] },
          usedLlmFallback: false,
        }),
        shouldUseAiBuilderLlmFallback: () => false,
      },
    })
    const handler = getRouteHandler(router, 'post', '/recommend')
    const res = makeRes()
    await handler(makeReq({ body: { prompt: 'Create a research team' } }), res)

    assert.strictEqual(res.statusCode, 200, 'Expected recommend success')
    assert.strictEqual(res.jsonBody?.ok, true, 'Expected ok recommend response')
    assert.strictEqual(res.jsonBody?.recommendation?.scope, 'team', 'Expected returned recommendation')
  })

  await test('starter-prompts maps missing AI credentials to HTTP 400', async () => {
    const router = loadRouterWithOverrides({
      aiGenerator: {
        generateBuilderStarterPromptsWithAI: async () => {
          throw new Error('No API key configured for AI generation')
        },
      },
    })
    const handler = getRouteHandler(router, 'post', '/starter-prompts')
    const res = makeRes()
    await handler(makeReq({ body: {} }), res)

    assert.strictEqual(res.statusCode, 400, 'Expected missing AI credentials to return HTTP 400')
    assert(/AI starter prompts need/i.test(res.jsonBody?.error || ''), 'Expected starter prompt credential guidance')
  })

  await test('share-status exposes whether Builder sharing is enabled', async () => {
    const router = loadRouterWithOverrides({
      aiBuilderShare: {
        isAiBuilderShareEnabled: () => true,
      },
    })
    const handler = getRouteHandler(router, 'get', '/share-status')
    const res = makeRes()
    await handler(makeReq(), res)

    assert.strictEqual(res.statusCode, 200, 'Expected share-status success')
    assert.strictEqual(res.jsonBody?.enabled, true, 'Expected enabled flag from share-status')
  })

  await test('share-session requires sessionId and messages', async () => {
    const router = loadRouterWithOverrides()
    const handler = getRouteHandler(router, 'post', '/share-session')
    const res = makeRes()
    await handler(makeReq({ body: { sessionId: '', messages: [] } }), res)

    assert.strictEqual(res.statusCode, 400, 'Expected missing share-session payload to return HTTP 400')
    assert(/sessionId and messages are required/i.test(res.jsonBody?.error || ''), 'Expected share-session validation guidance')
  })

  await test('share-feedback requires sessionId, recommendationKey, and feedback', async () => {
    const router = loadRouterWithOverrides()
    const handler = getRouteHandler(router, 'post', '/share-feedback')
    const res = makeRes()
    await handler(makeReq({ body: { sessionId: 'abc', recommendationKey: '' } }), res)

    assert.strictEqual(res.statusCode, 400, 'Expected missing share-feedback payload to return HTTP 400')
    assert(/sessionId, recommendationKey, and feedback are required/i.test(res.jsonBody?.error || ''), 'Expected share-feedback validation guidance')
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
