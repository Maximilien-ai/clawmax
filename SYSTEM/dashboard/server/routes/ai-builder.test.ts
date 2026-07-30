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

  await test('question route requires a non-empty question', async () => {
    const router = loadRouterWithOverrides()
    const handler = getRouteHandler(router, 'post', '/question')
    const res = makeRes()
    await handler(makeReq({ body: {} }), res)

    assert.strictEqual(res.statusCode, 400, 'Expected missing question to return HTTP 400')
    assert.strictEqual(res.jsonBody?.error, 'Question is required', 'Expected missing question guidance')
  })

  await test('question route answers without producing a Builder recommendation', async () => {
    let received: any = null
    const router = loadRouterWithOverrides({
      aiGenerator: {
        answerBuilderQuestionWithAI: async (input: any) => {
          received = input
          return 'Keep the existing recommendation and compare the two workflow options.'
        },
      },
    })
    const handler = getRouteHandler(router, 'post', '/question')
    const res = makeRes()
    await handler(makeReq({
      body: {
        question: 'Which option is cheaper?',
        messages: [{ role: 'assistant', content: 'Current recommendation' }],
        recommendationSummary: 'Use a two-agent workflow',
      },
    }), res)

    assert.strictEqual(res.statusCode, 200, 'Expected Builder question success')
    assert.strictEqual(res.jsonBody?.answer, 'Keep the existing recommendation and compare the two workflow options.')
    assert.strictEqual(res.jsonBody?.recommendation, undefined, 'Question mode must not replace the recommendation')
    assert.strictEqual(received?.question, 'Which option is cheaper?')
    assert.strictEqual(received?.recommendationSummary, 'Use a two-agent workflow')
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

  await test('recommend route applies AI fallback when grouping rationale is available', async () => {
    let fallbackCalled = false
    let applyCalled = false
    const router = loadRouterWithOverrides({
      aiBuilder: {
        buildAiBuilderRecommendation: () => ({
          summary: 'Base summary',
          intent: 'create',
          scope: 'team',
          operation: 'create',
          confidence: 'medium',
          matchedAssets: { organizationTemplates: [], agentTemplates: [] },
          usedLlmFallback: false,
        }),
        shouldUseAiBuilderLlmFallback: () => true,
        applyAiBuilderLlmFallback: (recommendation: any, prompt: string, fallback: any) => {
          applyCalled = true
          assert.strictEqual(prompt, 'Create a research team', 'Expected original prompt for fallback apply')
          assert.strictEqual(fallback.grouping, 'organization', 'Expected fallback grouping')
          return { ...recommendation, usedLlmFallback: true, scope: 'organization', summary: 'Fallback summary' }
        },
      },
      aiGenerator: {
        inferBuilderGroupingWithAI: async () => {
          fallbackCalled = true
          return { grouping: 'organization', rationale: 'Cross-cutting org workflow' }
        },
      },
    })
    const handler = getRouteHandler(router, 'post', '/recommend')
    const res = makeRes()
    await handler(makeReq({ body: { prompt: 'Create a research team' } }), res)

    assert.strictEqual(res.statusCode, 200, 'Expected recommend success with fallback')
    assert.strictEqual(fallbackCalled, true, 'Expected fallback inference to run')
    assert.strictEqual(applyCalled, true, 'Expected fallback application to run')
    assert.strictEqual(res.jsonBody?.recommendation?.usedLlmFallback, true, 'Expected fallback result to be applied')
    assert.strictEqual(res.jsonBody?.recommendation?.scope, 'organization', 'Expected fallback scope override')
  })

  await test('recommend route keeps deterministic recommendation when fallback inference fails', async () => {
    const router = loadRouterWithOverrides({
      aiBuilder: {
        buildAiBuilderRecommendation: () => ({
          summary: 'Base summary',
          intent: 'create',
          scope: 'team',
          operation: 'create',
          confidence: 'medium',
          matchedAssets: { organizationTemplates: [], agentTemplates: [] },
          usedLlmFallback: false,
        }),
        shouldUseAiBuilderLlmFallback: () => true,
      },
      aiGenerator: {
        inferBuilderGroupingWithAI: async () => {
          throw new Error('fallback unavailable')
        },
      },
    })
    const handler = getRouteHandler(router, 'post', '/recommend')
    const res = makeRes()
    await handler(makeReq({ body: { prompt: 'Create a research team' } }), res)

    assert.strictEqual(res.statusCode, 200, 'Expected recommend success when fallback fails')
    assert.strictEqual(res.jsonBody?.recommendation?.usedLlmFallback, false, 'Expected deterministic recommendation to remain')
    assert.strictEqual(res.jsonBody?.recommendation?.scope, 'team', 'Expected original scope to remain')
  })

  await test('recommend route maps builder errors to HTTP 500', async () => {
    const router = loadRouterWithOverrides({
      aiBuilder: {
        buildAiBuilderRecommendation: () => {
          throw new Error('builder exploded')
        },
      },
    })
    const handler = getRouteHandler(router, 'post', '/recommend')
    const res = makeRes()
    await handler(makeReq({ body: { prompt: 'Create a research team' } }), res)

    assert.strictEqual(res.statusCode, 500, 'Expected builder error to return HTTP 500')
    assert.strictEqual(res.jsonBody?.error, 'builder exploded', 'Expected builder error message')
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

  await test('starter-prompts maps invalid credential format errors to HTTP 400', async () => {
    const router = loadRouterWithOverrides({
      aiGenerator: {
        generateBuilderStarterPromptsWithAI: async () => {
          throw new Error('developer API key does not look like a valid token')
        },
      },
    })
    const handler = getRouteHandler(router, 'post', '/starter-prompts')
    const res = makeRes()
    await handler(makeReq({ body: {} }), res)

    assert.strictEqual(res.statusCode, 400, 'Expected invalid credential format to return HTTP 400')
    assert(/does not look like/i.test(res.jsonBody?.error || ''), 'Expected invalid credential guidance')
  })

  await test('starter-prompts maps unexpected AI failures to HTTP 500', async () => {
    const router = loadRouterWithOverrides({
      aiGenerator: {
        generateBuilderStarterPromptsWithAI: async () => {
          throw new Error('provider outage')
        },
      },
    })
    const handler = getRouteHandler(router, 'post', '/starter-prompts')
    const res = makeRes()
    await handler(makeReq({ body: {} }), res)

    assert.strictEqual(res.statusCode, 500, 'Expected unexpected AI failure to return HTTP 500')
    assert.strictEqual(res.jsonBody?.error, 'provider outage', 'Expected provider error message')
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

  await test('share-session normalizes payloads before delegating', async () => {
    let payload: any = null
    const router = loadRouterWithOverrides({
      aiBuilderShare: {
        shareAiBuilderSession: async (value: any) => {
          payload = value
          return { ok: true, shared: true }
        },
      },
    })
    const handler = getRouteHandler(router, 'post', '/share-session')
    const res = makeRes()
    await handler(makeReq({
      body: {
        sessionId: ' session-1 ',
        workspaceName: 'Coverage Workspace',
        workspaceId: 'workspace-1',
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'world' },
          { role: 'system', content: 'ignore me' },
          { role: 'user', content: 42 },
        ],
        recommendation: {
          intent: 'create',
          scope: 'team',
          operation: 'create',
          confidence: 'high',
          ignored: 'value',
        },
        matchedAssets: ['alpha', 42, 'beta'],
        feedback: 'up',
      },
    }), res)

    assert.strictEqual(res.statusCode, 200, 'Expected share session success')
    assert.deepStrictEqual(payload, {
      workspaceName: 'Coverage Workspace',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      source: 'dashboard_builder',
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'world' },
      ],
      recommendation: {
        intent: 'create',
        scope: 'team',
        operation: 'create',
        confidence: 'high',
      },
      matchedAssets: ['alpha', 'beta'],
      feedback: 'up',
    }, 'Expected normalized share-session payload')
  })

  await test('share-session maps share failures to HTTP 500', async () => {
    const router = loadRouterWithOverrides({
      aiBuilderShare: {
        shareAiBuilderSession: async () => {
          throw new Error('share failed')
        },
      },
    })
    const handler = getRouteHandler(router, 'post', '/share-session')
    const res = makeRes()
    await handler(makeReq({ body: { sessionId: 'abc', messages: [{ role: 'user', content: 'hello' }] } }), res)

    assert.strictEqual(res.statusCode, 500, 'Expected share-session failure to return HTTP 500')
    assert.strictEqual(res.jsonBody?.error, 'share failed', 'Expected share-session error')
  })

  await test('share-feedback requires sessionId, recommendationKey, and feedback', async () => {
    const router = loadRouterWithOverrides()
    const handler = getRouteHandler(router, 'post', '/share-feedback')
    const res = makeRes()
    await handler(makeReq({ body: { sessionId: 'abc', recommendationKey: '' } }), res)

    assert.strictEqual(res.statusCode, 400, 'Expected missing share-feedback payload to return HTTP 400')
    assert(/sessionId, recommendationKey, and feedback are required/i.test(res.jsonBody?.error || ''), 'Expected share-feedback validation guidance')
  })

  await test('share-feedback maps share failures to HTTP 500', async () => {
    const router = loadRouterWithOverrides({
      aiBuilderShare: {
        shareAiBuilderFeedback: async () => {
          throw new Error('feedback failed')
        },
      },
    })
    const handler = getRouteHandler(router, 'post', '/share-feedback')
    const res = makeRes()
    await handler(makeReq({ body: { sessionId: 'abc', recommendationKey: 'rec-1', feedback: 'up' } }), res)

    assert.strictEqual(res.statusCode, 500, 'Expected share-feedback failure to return HTTP 500')
    assert.strictEqual(res.jsonBody?.error, 'feedback failed', 'Expected share-feedback error')
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
