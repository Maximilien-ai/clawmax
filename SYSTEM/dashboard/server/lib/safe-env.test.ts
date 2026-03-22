/**
 * Safe env / BYOK execution test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/safe-env.test.ts
 */

import { providerKeyOverrides, safeEnv } from './safe-env'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
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

const originalEnv = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  NEBIUS_API_KEY: process.env.NEBIUS_API_KEY,
  USER_OPENAI_API_KEY: process.env.USER_OPENAI_API_KEY,
  USER_ANTHROPIC_API_KEY: process.env.USER_ANTHROPIC_API_KEY,
  USER_NEBIUS_API_KEY: process.env.USER_NEBIUS_API_KEY,
}

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (typeof value === 'undefined') delete process.env[key]
    else process.env[key] = value
  }
}

console.log(`\n${YELLOW}=== Safe Env Test Suite ===${RESET}\n`)

test('safeEnv prefers USER_* execution keys over system keys', () => {
  process.env.OPENAI_API_KEY = 'system-openai'
  process.env.USER_OPENAI_API_KEY = 'user-openai'
  process.env.ANTHROPIC_API_KEY = 'system-anthropic'
  process.env.USER_ANTHROPIC_API_KEY = 'user-anthropic'

  const env = safeEnv()

  assert(env.OPENAI_API_KEY === 'user-openai', 'Expected USER_OPENAI_API_KEY to win')
  assert(env.ANTHROPIC_API_KEY === 'user-anthropic', 'Expected USER_ANTHROPIC_API_KEY to win')
})

test('providerKeyOverrides returns undefined when no preview keys are present', () => {
  const overrides = providerKeyOverrides({ openai: '   ', anthropic: '', nebius: undefined })
  assert(typeof overrides === 'undefined', 'Expected no overrides when preview keys are empty')
})

test('providerKeyOverrides blanks non-configured providers when preview keys are present', () => {
  const overrides = providerKeyOverrides({ openai: 'preview-openai' })

  assert(overrides?.OPENAI_API_KEY === 'preview-openai', 'Expected explicit OpenAI preview key')
  assert(overrides?.ANTHROPIC_API_KEY === '', 'Expected Anthropic to be blanked for preview execution')
  assert(overrides?.NEBIUS_API_KEY === '', 'Expected Nebius to be blanked for preview execution')
})

test('safeEnv applies BYOK preview overrides over env defaults', () => {
  process.env.OPENAI_API_KEY = 'system-openai'
  process.env.USER_OPENAI_API_KEY = 'user-openai'
  process.env.ANTHROPIC_API_KEY = 'system-anthropic'
  process.env.USER_ANTHROPIC_API_KEY = 'user-anthropic'

  const env = safeEnv(providerKeyOverrides({ openai: 'preview-openai' }))

  assert(env.OPENAI_API_KEY === 'preview-openai', 'Expected preview OpenAI key to override env defaults')
  assert(env.ANTHROPIC_API_KEY === '', 'Expected Anthropic to stay blank during preview OpenAI execution')
})

setTimeout(() => {
  restoreEnv()
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
}, 0)
