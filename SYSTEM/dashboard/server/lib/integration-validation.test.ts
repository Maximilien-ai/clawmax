/**
 * Integration validation test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/integration-validation.test.ts
 */

import { validateAnthropicKey, validateGeminiKey, validateIntegrations, validateOllamaConfig, validateOpenAIKey, validateOpikConfig, validateSensoConfig } from './integration-validation'

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

function mockOllamaFetch(models: string[]): typeof fetch {
  return (async () => ({
    ok: true,
    status: 200,
    json: async () => ({ models: models.map((name) => ({ name })) }),
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

  await test('validateOpenAIKey rejects obvious Anthropic key shape before network validation', async () => {
    const result = await validateOpenAIKey('sk-ant-api03-test-value', mockFetch(200))
    assert(result.status === 'invalid', 'Expected invalid status')
    assert(/Anthropic key/i.test(result.message), 'Expected mismatch message to mention Anthropic key')
  })

  await test('validateGeminiKey rejects obvious OpenAI key shape before network validation', async () => {
    const result = await validateGeminiKey('sk-proj-test-value', mockFetch(200))
    assert(result.status === 'invalid', 'Expected invalid status')
    assert(/OpenAI key/i.test(result.message), 'Expected mismatch message to mention OpenAI key')
  })

  await test('validateOpikConfig requires workspace when key is present', async () => {
    const result = await validateOpikConfig('opik-key', '', 'clawmax', mockFetch(200))
    assert(result.status === 'invalid', 'Expected invalid status for missing workspace')
  })

  await test('validateOllamaConfig returns valid when default model exists', async () => {
    const result = await validateOllamaConfig('http://localhost:11434', 'llama3.2', mockOllamaFetch(['llama3.2', 'qwen2.5']))
    assert(result.status === 'valid', 'Expected valid status')
  })

  await test('validateSensoConfig checks presence of key', async () => {
    const result = await validateSensoConfig('senso-key')
    assert(result.status === 'valid', 'Expected valid status')
  })

  await test('validateIntegrations aggregates provider checks', async () => {
    const result = await validateIntegrations({
      openai: 'sk-openai',
      anthropic: 'sk-ant',
      gemini: 'gemini-key',
      ollamaBaseUrl: 'http://localhost:11434',
      ollamaDefaultModel: 'llama3.2',
      opikApiKey: 'opik-key',
      opikWorkspace: 'team',
      opikProject: 'clawmax',
      sensoApiKey: 'senso-key',
    }, (async (url: string) => {
      if (url.includes('/api/tags')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ models: [{ name: 'llama3.2' }] }),
        } as any
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
      } as any
    }) as any)

    assert(result.openai?.status === 'valid', 'Expected OpenAI valid')
    assert(result.anthropic?.status === 'valid', 'Expected Anthropic valid')
    assert(result.gemini?.status === 'valid', 'Expected Gemini valid')
    assert(result.ollama?.status === 'valid', 'Expected Ollama valid')
    assert(result.opik?.status === 'valid', 'Expected Opik valid')
    assert(result.senso?.status === 'valid', 'Expected Senso valid')
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
