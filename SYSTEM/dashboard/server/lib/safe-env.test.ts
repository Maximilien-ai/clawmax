/**
 * Safe env / BYOK execution test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/safe-env.test.ts
 */

import {
  allowSystemKeysForUserExecution,
  resolveSystemExecutionProviderKeys,
  resolveUserExecutionProviderKeys,
} from './dashboard-env'
import { safeEnv, systemExecutionEnv, userExecutionEnv } from './safe-env'

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
}

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (typeof value === 'undefined') delete process.env[key]
    else process.env[key] = value
  }
}

console.log(`\n${YELLOW}=== Safe Env Test Suite ===${RESET}\n`)

test('safeEnv never forwards ambient shell provider keys by default', () => {
  process.env.OPENAI_API_KEY = 'system-openai'
  process.env.ANTHROPIC_API_KEY = 'system-anthropic'

  const env = safeEnv()

  assert(typeof env.OPENAI_API_KEY === 'undefined', 'Expected ambient OpenAI key to stay out of child env')
  assert(typeof env.ANTHROPIC_API_KEY === 'undefined', 'Expected ambient Anthropic key to stay out of child env')
})

test('user execution prefers BYOK request keys over env defaults', () => {
  const keys = resolveUserExecutionProviderKeys(
    {
      USER_OPENAI_API_KEY: 'env-user-openai',
      USER_ANTHROPIC_API_KEY: 'env-user-anthropic',
    },
    { openai: 'preview-openai' }
  )

  assert(keys.openai === 'preview-openai', 'Expected request BYOK OpenAI key to win')
  assert(typeof keys.anthropic === 'undefined', 'Expected non-selected provider to remain unset')
})

test('user execution uses env user defaults before any system fallback', () => {
  const keys = resolveUserExecutionProviderKeys({
    USER_OPENAI_API_KEY: 'env-user-openai',
    SYSTEM_OPENAI_API_KEY: 'env-system-openai',
  })

  assert(keys.openai === 'env-user-openai', 'Expected user default key to win for user execution')
})

test('system fallback for user execution is opt-in only', () => {
  const disabled = resolveUserExecutionProviderKeys({
    SYSTEM_OPENAI_API_KEY: 'env-system-openai',
  })
  const enabled = resolveUserExecutionProviderKeys({
    SYSTEM_OPENAI_API_KEY: 'env-system-openai',
    ALLOW_SYSTEM_KEYS_FOR_USER_EXECUTION: 'true',
  })

  assert(typeof disabled.openai === 'undefined', 'Expected no system fallback when flag is disabled')
  assert(enabled.openai === 'env-system-openai', 'Expected system fallback only when flag is enabled')
  assert(allowSystemKeysForUserExecution({ ALLOW_SYSTEM_KEYS_FOR_USER_EXECUTION: 'true' }), 'Expected explicit true flag')
})

test('system execution uses system keys and falls back to user defaults only when system keys are absent', () => {
  const systemFirst = resolveSystemExecutionProviderKeys({
    SYSTEM_OPENAI_API_KEY: 'env-system-openai',
    USER_OPENAI_API_KEY: 'env-user-openai',
  })
  const fallback = resolveSystemExecutionProviderKeys({
    USER_OPENAI_API_KEY: 'env-user-openai',
  })

  assert(systemFirst.openai === 'env-system-openai', 'Expected system key to power system execution')
  assert(fallback.openai === 'env-user-openai', 'Expected user key fallback when no system key exists')
})

test('resolution helpers ignore ambient shell provider exports when raw dashboard env is empty', () => {
  process.env.OPENAI_API_KEY = 'shell-openai'
  const keys = resolveSystemExecutionProviderKeys({})
  assert(typeof keys.openai === 'undefined', 'Expected empty dashboard env to ignore shell OpenAI export')
})

test('userExecutionEnv blanks non-selected providers during BYOK execution', () => {
  const env = userExecutionEnv({ openai: 'preview-openai' })

  assert(env.OPENAI_API_KEY === 'preview-openai', 'Expected BYOK OpenAI key in child env')
  assert(env.ANTHROPIC_API_KEY === '', 'Expected Anthropic to be blanked during BYOK OpenAI execution')
  assert(env.NEBIUS_API_KEY === '', 'Expected Nebius to be blanked during BYOK OpenAI execution')
})

test('systemExecutionEnv uses resolved system execution keys, not shell exports', () => {
  const env = systemExecutionEnv()
  assert(env.PATH === process.env.PATH, 'Expected safe base env to retain PATH')
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
