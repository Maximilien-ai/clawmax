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

console.log(`workflow-execution-env.test.ts: ${passed} tests passed`)

if (failed > 0) {
  process.exit(1)
}
