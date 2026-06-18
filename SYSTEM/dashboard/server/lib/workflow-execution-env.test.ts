/**
 * Workflow execution environment regression tests.
 *
 * Run with: npx ts-node --transpileOnly server/lib/workflow-execution-env.test.ts
 */

import { resolveWorkflowExecutionProviderKeys } from './dashboard-env'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const RESET = '\x1b[0m'

let passed = 0
let failed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    passed++
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.error(`  Error: ${err.message}`)
    failed++
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

test('workflow execution uses runtime system OpenAI key when no user key exists', () => {
  const keys = resolveWorkflowExecutionProviderKeys({
    SYSTEM_OPENAI_API_KEY: 'runtime-openai',
  })

  assert(keys.openai === 'runtime-openai', 'Expected workflow execution to fall back to runtime OpenAI key')
})

test('workflow execution keeps explicit BYOK provider isolated from system keys', () => {
  const keys = resolveWorkflowExecutionProviderKeys({
    SYSTEM_OPENAI_API_KEY: 'runtime-openai',
  }, {
    anthropic: 'request-anthropic',
  })

  assert(keys.anthropic === 'request-anthropic', 'Expected BYOK Anthropic key to win')
  assert(typeof keys.openai === 'undefined', 'Expected system OpenAI key to stay out of BYOK Anthropic execution')
})

test('workflow execution keeps explicit OpenAI-compatible BYOK isolated from hosted OpenAI system keys', () => {
  const keys = resolveWorkflowExecutionProviderKeys({
    SYSTEM_OPENAI_API_KEY: 'runtime-openai',
  }, {
    openaiCompatibleApiKey: 'lmstudio-key',
    openaiCompatibleBaseUrl: 'http://127.0.0.1:1234/v1',
    openaiCompatibleDefaultModel: 'qwen3.6-27b',
  })

  assert(keys.openaiCompatibleApiKey === 'lmstudio-key', 'Expected OpenAI-compatible API key to win')
  assert(keys.openaiCompatibleBaseUrl === 'http://127.0.0.1:1234/v1', 'Expected OpenAI-compatible base URL to win')
  assert(keys.openaiCompatibleDefaultModel === 'qwen3.6-27b', 'Expected OpenAI-compatible default model to win')
  assert(typeof keys.openai === 'undefined', 'Expected hosted system OpenAI key to stay out of OpenAI-compatible workflow execution')
})

console.log(`workflow-execution-env.test.ts: ${passed} tests passed`)

if (failed > 0) {
  process.exit(1)
}
