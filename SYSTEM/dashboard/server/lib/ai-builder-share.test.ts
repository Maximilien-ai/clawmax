import {
  getAiBuilderCandidateUrls,
  getAiBuilderRemoteUrl,
  getAiBuilderWriteToken,
  isAiBuilderShareEnabled,
  shareAiBuilderFeedback,
  shareAiBuilderSession,
} from './ai-builder-share'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    testsPassed++
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.log(`  Error: ${err.message}`)
    testsFailed++
  }
}

const originalFetch = globalThis.fetch
const originalRemoteUrl = process.env.AI_BUILDER_REMOTE_URL
const originalLegacyUrl = process.env.AI_BUILDER_URL
const originalWriteToken = process.env.AI_BUILDER_WRITE_TOKEN
const originalLegacyToken = process.env.AI_BUILDER_TOKEN

console.log(`\n${YELLOW}=== AI Builder Share Test Suite ===${RESET}\n`)

async function run() {
  await test('remote URL defaults to clawmax web API', () => {
    delete process.env.AI_BUILDER_REMOTE_URL
    delete process.env.AI_BUILDER_URL
    assert(getAiBuilderRemoteUrl() === 'https://www.clawmax.ai/api/ai-builder', `Unexpected default URL: ${getAiBuilderRemoteUrl()}`)
    const candidates = getAiBuilderCandidateUrls()
    assert(candidates[0] === 'https://www.clawmax.ai/api/ai-builder', 'Expected www primary URL')
    assert(candidates[1] === 'https://clawmax.ai/api/ai-builder', 'Expected apex fallback URL')
  })

  await test('configured remote URL and write token enable sharing', () => {
    process.env.AI_BUILDER_REMOTE_URL = 'https://builder.example.com/api/ai-builder'
    process.env.AI_BUILDER_URL = 'https://legacy.example.com/api/ai-builder'
    process.env.AI_BUILDER_WRITE_TOKEN = 'trusted-token'
    process.env.AI_BUILDER_TOKEN = 'legacy-token'
    assert(getAiBuilderRemoteUrl() === 'https://builder.example.com/api/ai-builder', 'Expected remote override to win')
    assert(getAiBuilderWriteToken() === 'trusted-token', 'Expected write token override to win')
    assert(isAiBuilderShareEnabled(), 'Expected sharing to be enabled')
  })

  await test('shareAiBuilderSession stays local-only when no token is configured', async () => {
    delete process.env.AI_BUILDER_REMOTE_URL
    delete process.env.AI_BUILDER_URL
    delete process.env.AI_BUILDER_WRITE_TOKEN
    delete process.env.AI_BUILDER_TOKEN
    let called = false
    globalThis.fetch = (async () => {
      called = true
      throw new Error('fetch should not be called')
    }) as any

    const result = await shareAiBuilderSession({
      workspaceName: 'Personal',
      workspaceId: 'personal',
      sessionId: 'builder-123',
      source: 'dashboard_builder',
      messages: [{ role: 'user', content: 'Help me build a team.' }],
    })

    assert(result.shared === false, 'Expected disabled share result')
    assert(called === false, 'Expected no remote fetch when sharing disabled')
  })

  await test('shareAiBuilderSession posts to remote endpoint with auth', async () => {
    process.env.AI_BUILDER_REMOTE_URL = 'https://builder.example.com/api/ai-builder'
    process.env.AI_BUILDER_WRITE_TOKEN = 'trusted-token'

    const calls: Array<{ url: string; init: RequestInit | undefined }> = []
    globalThis.fetch = (async (input: any, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      return {
        ok: true,
        status: 200,
        json: async () => ({ share: { id: 'share_123' } }),
      } as any
    }) as any

    const result = await shareAiBuilderSession({
      workspaceName: 'Personal',
      workspaceId: 'personal',
      sessionId: 'builder-123',
      source: 'dashboard_builder',
      messages: [{ role: 'user', content: 'Help me build a team.' }],
      recommendation: { intent: 'team_template', scope: 'team', operation: 'create_new', confidence: 'medium' },
    })

    assert(result.shared === true, 'Expected remote session share')
    assert(result.remoteId === 'share_123', 'Expected remote share ID')
    assert(calls.length === 1, `Expected one fetch call, got ${calls.length}`)
    assert(calls[0].url === 'https://builder.example.com/api/ai-builder/sessions', `Unexpected session URL: ${calls[0].url}`)
    assert(String((calls[0].init?.headers as Record<string, string>)?.Authorization || '') === 'Bearer trusted-token', 'Expected bearer token auth')
  })

  await test('shareAiBuilderFeedback falls back when primary URL fails', async () => {
    delete process.env.AI_BUILDER_REMOTE_URL
    delete process.env.AI_BUILDER_URL
    process.env.AI_BUILDER_WRITE_TOKEN = 'trusted-token'

    const calls: string[] = []
    globalThis.fetch = (async (input: any) => {
      const url = String(input)
      calls.push(url)
      if (url === 'https://www.clawmax.ai/api/ai-builder/feedback') {
        throw new Error('connect ECONNREFUSED')
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ share: { id: 'feedback_123' } }),
      } as any
    }) as any

    const result = await shareAiBuilderFeedback({
      workspaceName: 'Personal',
      workspaceId: 'personal',
      sessionId: 'builder-123',
      recommendationKey: 'team_template|team|create_new|Create a new team template',
      feedback: 'up',
    })

    assert(result.shared === true, 'Expected remote feedback share')
    assert(calls.length === 2, `Expected primary + fallback fetch calls, got ${calls.length}`)
    assert(calls[1] === 'https://clawmax.ai/api/ai-builder/feedback', `Unexpected fallback URL: ${calls[1]}`)
  })

  globalThis.fetch = originalFetch
  if (typeof originalRemoteUrl === 'undefined') delete process.env.AI_BUILDER_REMOTE_URL
  else process.env.AI_BUILDER_REMOTE_URL = originalRemoteUrl
  if (typeof originalLegacyUrl === 'undefined') delete process.env.AI_BUILDER_URL
  else process.env.AI_BUILDER_URL = originalLegacyUrl
  if (typeof originalWriteToken === 'undefined') delete process.env.AI_BUILDER_WRITE_TOKEN
  else process.env.AI_BUILDER_WRITE_TOKEN = originalWriteToken
  if (typeof originalLegacyToken === 'undefined') delete process.env.AI_BUILDER_TOKEN
  else process.env.AI_BUILDER_TOKEN = originalLegacyToken

  console.log('\n========================================')
  console.log(`Tests passed: ${testsPassed}`)
  console.log(`Tests failed: ${testsFailed}`)
  console.log('========================================\n')

  if (testsFailed > 0) {
    console.log(`${RED}Some tests failed${RESET}`)
    process.exit(1)
  }
  console.log(`${GREEN}All tests passed! ✓${RESET}`)
}

run().catch((err) => {
  globalThis.fetch = originalFetch
  console.error(err)
  process.exit(1)
})
