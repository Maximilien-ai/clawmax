/**
 * BYOK helper test suite
 *
 * Run with: npx ts-node --transpileOnly client/src/lib/byok.test.ts
 */

import { byokForRequest, hasAiGenerationAccess, hasChatExecutionAccess, refreshModelsWithByok, writeStoredByokKeys } from './byok'

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

async function main() {
  console.log(`\n${YELLOW}=== BYOK Helper Test Suite ===${RESET}\n`)

  await test('browser-local BYOK key enables AI generation access', () => {
    localStorage.clear()
    writeStoredByokKeys({ openai: 'sk-test' })
    assert(hasAiGenerationAccess(null) === true, 'Expected browser-local key to enable AI generation access')
  })

  await test('user default keys enable AI generation access', () => {
    localStorage.clear()
    assert(
      hasAiGenerationAccess({ userKeyDefaults: { openai: true } }) === true,
      'Expected user default key to enable AI generation access'
    )
  })

  await test('system keys require explicit allowSystemKeysForUserExecution', () => {
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

  await test('gemini and ollama do not count as agent/template AI generation access yet', () => {
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

  await test('no browser or shared execution path blocks AI generation access', () => {
    localStorage.clear()
    assert(hasAiGenerationAccess(null) === false, 'Expected no execution path to block AI generation access')
  })

  await test('chat execution access supports gemini and ollama paths', () => {
    localStorage.clear()
    writeStoredByokKeys({ geminiApiKey: 'gemini-test' })
    assert(hasChatExecutionAccess(null) === true, 'Expected Gemini BYOK to enable chat execution')
    localStorage.clear()
    writeStoredByokKeys({ ollamaBaseUrl: 'http://localhost:11434' })
    assert(hasChatExecutionAccess(null) === true, 'Expected Ollama BYOK to enable chat execution')
  })

  await test('chat execution access supports on-prem default Ollama contract from auth config', () => {
    localStorage.clear()
    assert(
      hasChatExecutionAccess({ ollamaEnabled: true, defaultOllamaBaseUrl: 'http://localhost:11434' }) === true,
      'Expected enabled default Ollama base URL to allow chat execution without browser-local BYOK'
    )
  })

  await test('request payload maps geminiApiKey to gemini', () => {
    localStorage.clear()
    writeStoredByokKeys({
      openai: 'openai-test',
      anthropic: 'anthropic-test',
      geminiApiKey: 'gemini-test',
      ollamaBaseUrl: 'http://localhost:11434',
    })
    const payload = byokForRequest()
    assert(payload.openai === 'openai-test', 'Expected OpenAI key in request payload')
    assert(payload.anthropic === 'anthropic-test', 'Expected Anthropic key in request payload')
    assert(payload.gemini === 'gemini-test', 'Expected Gemini key to map from geminiApiKey')
    assert(payload.ollamaBaseUrl === 'http://localhost:11434', 'Expected Ollama base URL in request payload')
    assert(!(payload as any).geminiApiKey, 'Expected storage-only geminiApiKey field to stay out of request payload')
  })

  await test('refreshModelsWithByok posts request-shaped provider keys', async () => {
    localStorage.clear()
    writeStoredByokKeys({
      openai: 'openai-test',
      anthropic: 'anthropic-test',
      geminiApiKey: 'gemini-test',
      ollamaBaseUrl: 'http://localhost:11434',
    })

    let requestBody: any = null
    ;(globalThis as any).fetch = async (_url: string, init?: RequestInit) => {
      requestBody = init?.body ? JSON.parse(String(init.body)) : null
      return {
        ok: true,
        json: async () => ({ models: [], modelsByProvider: {} }),
      }
    }

    await refreshModelsWithByok()
    assert(requestBody?.openai === 'openai-test', 'Expected refresh request to include OpenAI key')
    assert(requestBody?.anthropic === 'anthropic-test', 'Expected refresh request to include Anthropic key')
    assert(requestBody?.gemini === 'gemini-test', 'Expected refresh request to include Gemini key under gemini')
    assert(!('geminiApiKey' in (requestBody || {})), 'Expected refresh request to omit geminiApiKey storage field')
    assert(requestBody?.ollamaBaseUrl === 'http://localhost:11434', 'Expected refresh request to include Ollama base URL')
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

main().catch((err: any) => {
  console.log(`${RED}Test suite crashed${RESET}`)
  console.log(`  Error: ${err?.message || String(err)}`)
  process.exit(1)
})
