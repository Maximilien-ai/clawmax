/**
 * Integration validation test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/integration-validation.test.ts
 */

import { validateAnthropicKey, validateGeminiKey, validateIntegrations, validateOpenAIKey, validateOpikConfig } from './integration-validation'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    testsPassed++
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.error(`  Error: ${err.message}`)
    testsFailed++
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function mockFetch(status: number, body: any = {}): typeof fetch {
  return (async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as any
}

console.log(`\n${YELLOW}=== Integration Validation Test Suite ===${RESET}\n`)

async function run() {
  await test('validateOpenAIKey returns valid on 200', async () => {
    const result = await validateOpenAIKey('sk-test', mockFetch(200))
    assert(result.status === 'valid', 'Expected valid status')
  })

  await test('validateAnthropicKey returns invalid on 401', async () => {
    const result = await validateAnthropicKey('sk-ant-test', mockFetch(401))
    assert(result.status === 'invalid', 'Expected invalid status')
  })

  await test('validateGeminiKey returns valid on 200', async () => {
    const result = await validateGeminiKey('gemini-test', mockFetch(200))
    assert(result.status === 'valid', 'Expected valid status')
  })

  await test('validateOpikConfig requires workspace when key is present', async () => {
    const result = await validateOpikConfig('opik-key', '', 'clawmax', mockFetch(200))
    assert(result.status === 'invalid', 'Expected invalid status for missing workspace')
  })

  await test('validateIntegrations aggregates provider checks', async () => {
    const result = await validateIntegrations({
      openai: 'sk-openai',
      anthropic: 'sk-ant',
      gemini: 'gemini-key',
      opikApiKey: 'opik-key',
      opikWorkspace: 'team',
      opikProject: 'clawmax',
    }, mockFetch(200))

    assert(result.openai?.status === 'valid', 'Expected OpenAI valid')
    assert(result.anthropic?.status === 'valid', 'Expected Anthropic valid')
    assert(result.gemini?.status === 'valid', 'Expected Gemini valid')
    assert(result.opik?.status === 'valid', 'Expected Opik valid')
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
