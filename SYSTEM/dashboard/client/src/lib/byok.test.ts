/**
 * BYOK helper test suite
 *
 * Run with: npx ts-node --transpileOnly client/src/lib/byok.test.ts
 */

import { hasAiGenerationAccess, hasChatExecutionAccess, writeStoredByokKeys } from './byok'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    testsPassed++
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.log(`  Error: ${err.message}`)
    testsFailed++
  }
}

function installLocalStorageMock() {
  const store = new Map<string, string>()
  ;(globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
  }
  ;(globalThis as any).window = {
    dispatchEvent: () => true,
  }
}

installLocalStorageMock()

console.log(`\n${YELLOW}=== BYOK Helper Test Suite ===${RESET}\n`)

test('browser-local BYOK key enables AI generation access', () => {
  localStorage.clear()
  writeStoredByokKeys({ openai: 'sk-test' })
  assert(hasAiGenerationAccess(null) === true, 'Expected browser-local key to enable AI generation access')
})

test('user default keys enable AI generation access', () => {
  localStorage.clear()
  assert(
    hasAiGenerationAccess({ userKeyDefaults: { openai: true } }) === true,
    'Expected user default key to enable AI generation access'
  )
})

test('system keys require explicit allowSystemKeysForUserExecution', () => {
  localStorage.clear()
  assert(
    hasAiGenerationAccess({ systemKeyDefaults: { openai: true }, allowSystemKeysForUserExecution: false }) === false,
    'Expected system keys alone to stay blocked when user execution is not allowed'
  )
  assert(
    hasAiGenerationAccess({ systemKeyDefaults: { openai: true }, allowSystemKeysForUserExecution: true }) === true,
    'Expected allowed system keys to enable AI generation access'
  )
})

test('gemini and ollama do not count as agent/template AI generation access yet', () => {
  localStorage.clear()
  writeStoredByokKeys({ geminiApiKey: 'gemini-test', ollamaBaseUrl: 'http://localhost:11434' })
  assert(
    hasAiGenerationAccess(null) === false,
    'Expected unsupported local providers to stay blocked for current AI generation flows'
  )
  localStorage.clear()
  assert(
    hasAiGenerationAccess({ userKeyDefaults: { gemini: true } }) === false,
    'Expected unsupported shared Gemini-only path to stay blocked for current AI generation flows'
  )
})

test('no browser or shared execution path blocks AI generation access', () => {
  localStorage.clear()
  assert(hasAiGenerationAccess(null) === false, 'Expected no execution path to block AI generation access')
})

test('chat execution access supports gemini and ollama paths', () => {
  localStorage.clear()
  writeStoredByokKeys({ geminiApiKey: 'gemini-test' })
  assert(hasChatExecutionAccess(null) === true, 'Expected Gemini BYOK to enable chat execution')
  localStorage.clear()
  writeStoredByokKeys({ ollamaBaseUrl: 'http://localhost:11434' })
  assert(hasChatExecutionAccess(null) === true, 'Expected Ollama BYOK to enable chat execution')
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
