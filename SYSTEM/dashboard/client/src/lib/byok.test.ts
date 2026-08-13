/**
 * BYOK helper test suite
 *
 * Run with: npx ts-node --transpileOnly client/src/lib/byok.test.ts
 */

import { byokForRequest, detectProviderKeyMismatch, getAiGenerationReadiness, hasAiGenerationAccess, hasChatExecutionAccess, hasCogneeConfiguration, isOllamaUiAvailable, refreshModelsWithByok, resolveOllamaBaseUrlForRuntime, resolveOpenAiCompatibleBaseUrlForRuntime, resolveSelectedPartnersForWorkspace, shouldAutoValidateByokOnSave, writeStoredByokKeys } from './byok'

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

  await test('OpenAI-compatible endpoint with default model enables AI generation access', () => {
    localStorage.clear()
    writeStoredByokKeys({ openaiCompatibleBaseUrl: 'http://127.0.0.1:1234/v1', openaiCompatibleDefaultModel: 'local-model' })
    assert(hasAiGenerationAccess(null) === true, 'Expected OpenAI-compatible endpoint to enable AI generation access')
  })

  await test('OpenAI-compatible endpoint without default model warns for AI generation', () => {
    localStorage.clear()
    writeStoredByokKeys({ openaiCompatibleBaseUrl: 'http://127.0.0.1:1234/v1' })
    const readiness = getAiGenerationReadiness(null)
    assert(readiness.enabled === true, 'Expected OpenAI-compatible path to stay visible')
    assert(/default model/i.test(readiness.warning || ''), 'Expected default-model warning')
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

  await test('an enabled CLI runtime counts as a ready generation path', () => {
    // The wizards warned "no verified hosted execution path" while generation was in fact
    // succeeding through the CLI, pointing the operator at a key the request would never use.
    localStorage.clear()
    const readiness = getAiGenerationReadiness({ enabledRuntimes: ['claude'] } as any)
    assert(readiness.enabled === true, 'Expected generation to be enabled')
    assert(!readiness.warning, `Unexpected warning: ${readiness.warning}`)
  })

  await test('with no CLI runtime enabled the hosted-path warning still fires', () => {
    localStorage.clear()
    const readiness = getAiGenerationReadiness({ enabledRuntimes: [] } as any)
    assert(readiness.warning, 'Expected a hosted-path warning when nothing is configured')
  })

  await test('AI generation readiness warns when no hosted path is configured', () => {
    localStorage.clear()
    const readiness = getAiGenerationReadiness(null)
    assert(readiness.enabled === false, 'Expected readiness to stay disabled without hosted path')
    assert(/will fail/i.test(readiness.warning || ''), 'Expected readiness warning for missing hosted path')
  })

  await test('AI generation readiness warns when browser key is unverified and no shared hosted path exists', () => {
    localStorage.clear()
    writeStoredByokKeys({ openai: 'sk-test-unverified' })
    const readiness = getAiGenerationReadiness(null)
    assert(readiness.enabled === true, 'Expected hosted browser key to allow AI generation attempt')
    assert(/not been verified yet/i.test(readiness.warning || ''), 'Expected unverified-key warning')
  })

  await test('AI generation readiness clears warning when verified browser key is present', () => {
    localStorage.clear()
    writeStoredByokKeys({
      openai: 'sk-test-verified',
      verifiedProviders: { openai: 'sk-test-verified' },
    })
    const readiness = getAiGenerationReadiness(null)
    assert(readiness.enabled === true, 'Expected verified hosted browser key to allow AI generation')
    assert(!readiness.warning, 'Expected no warning for verified browser key')
  })

  await test('chat execution access supports gemini and ollama paths', () => {
    localStorage.clear()
    writeStoredByokKeys({ geminiApiKey: 'gemini-test' })
    assert(hasChatExecutionAccess(null) === true, 'Expected Gemini BYOK to enable chat execution')
    localStorage.clear()
    writeStoredByokKeys({ ollamaBaseUrl: 'http://localhost:11434' })
    assert(hasChatExecutionAccess(null) === true, 'Expected Ollama BYOK to enable chat execution')
  })

  await test('OpenRouter BYOK enables chat and is forwarded with its native request field', () => {
    localStorage.clear()
    writeStoredByokKeys({ openrouter: 'sk-or-test' })
    assert(hasChatExecutionAccess(null) === true, 'Expected OpenRouter BYOK to enable chat execution')
    const payload = byokForRequest()
    assert(payload.openrouter === 'sk-or-test', 'Expected OpenRouter key in BYOK request payload')
    assert(typeof payload.openai === 'undefined', 'Expected OpenRouter BYOK not to populate OpenAI key')
  })

  await test('xAI BYOK enables chat and remains isolated from OpenAI', () => {
    localStorage.clear()
    writeStoredByokKeys({ xai: 'xai-test' })
    assert(hasChatExecutionAccess(null) === true, 'Expected xAI BYOK to enable chat execution')
    const payload = byokForRequest()
    assert(payload.xai === 'xai-test', 'Expected xAI key in BYOK request payload')
    assert(typeof payload.openai === 'undefined', 'Expected xAI BYOK not to populate OpenAI key')
  })

  await test('chat execution access supports on-prem default Ollama contract from auth config', () => {
    localStorage.clear()
    assert(
      hasChatExecutionAccess({ deploymentKind: 'onprem', ollamaEnabled: true, defaultOllamaBaseUrl: 'http://host.containers.internal:11434' }) === true,
      'Expected enabled default Ollama base URL to allow chat execution without browser-local BYOK'
    )
  })

  await test('deployment kind hides Ollama only in cloud and keeps it for local and onprem', () => {
    assert(
      isOllamaUiAvailable({ deploymentKind: 'local', ollamaEnabled: true, defaultOllamaBaseUrl: 'http://localhost:11434' }) === true,
      'Expected local deployment to allow Ollama UI'
    )
    assert(
      isOllamaUiAvailable({ deploymentKind: 'onprem', ollamaEnabled: true, defaultOllamaBaseUrl: 'http://host.containers.internal:11434' }) === true,
      'Expected onprem deployment to allow Ollama UI'
    )
    assert(
      isOllamaUiAvailable({ deploymentKind: 'cloud', ollamaEnabled: true, defaultOllamaBaseUrl: 'http://host.containers.internal:11434' }) === false,
      'Expected cloud deployment to hide Ollama UI'
    )
  })

  await test('managed on-prem Ollama prefers runtime-provided host bridge over stale localhost', () => {
    const resolved = resolveOllamaBaseUrlForRuntime({
      configuredBaseUrl: 'http://localhost:11434',
      managedRuntime: true,
      runtimeDefaultBaseUrl: 'http://host.containers.internal:11434',
    })
    assert(
      resolved === 'http://host.containers.internal:11434',
      `Expected runtime host bridge URL, got ${resolved}`
    )
  })

  await test('managed on-prem Ollama preserves explicit non-local custom overrides', () => {
    const resolved = resolveOllamaBaseUrlForRuntime({
      configuredBaseUrl: 'http://10.0.0.5:11434',
      managedRuntime: true,
      runtimeDefaultBaseUrl: 'http://host.containers.internal:11434',
    })
    assert(
      resolved === 'http://10.0.0.5:11434',
      `Expected explicit custom runtime URL to win, got ${resolved}`
    )
  })

  await test('managed on-prem OpenAI-compatible prefers runtime host bridge over stale localhost', () => {
    const resolved = resolveOpenAiCompatibleBaseUrlForRuntime({
      configuredBaseUrl: 'http://127.0.0.1:1234/v1',
      managedRuntime: true,
      runtimeDefaultBaseUrl: 'http://host.containers.internal:1234/v1',
    })
    assert(
      resolved === 'http://host.containers.internal:1234/v1',
      `Expected runtime host bridge URL, got ${resolved}`
    )
  })

  await test('managed on-prem OpenAI-compatible preserves explicit non-local custom overrides', () => {
    const resolved = resolveOpenAiCompatibleBaseUrlForRuntime({
      configuredBaseUrl: 'http://10.0.0.5:1234/v1',
      managedRuntime: true,
      runtimeDefaultBaseUrl: 'http://host.containers.internal:1234/v1',
    })
    assert(
      resolved === 'http://10.0.0.5:1234/v1',
      `Expected explicit custom runtime URL to win, got ${resolved}`
    )
  })

  await test('workspace-selected partners hydrate from saved config and keep locked partners', () => {
    const selected = resolveSelectedPartnersForWorkspace({
      enabledPartners: ['resend', 'github'],
      lockedPartnerSlugs: ['opik', 'resend'],
    })
    assert(selected.includes('resend'), 'Expected saved Resend partner to persist')
    assert(selected.includes('github'), 'Expected saved GitHub partner to persist')
    assert(selected.includes('opik'), 'Expected locked Opik partner to stay selected')
    assert(selected.length === 3, `Expected deduplicated partner list, got ${selected.join(', ')}`)
  })

  await test('Cognee explicit check requires Cloud key or self-hosted/default configuration', () => {
    assert(hasCogneeConfiguration({}) === false, 'Expected empty Cognee config to be unavailable')
    assert(hasCogneeConfiguration({ apiKey: ' cognee-key ' }) === true, 'Expected Cognee API key to be available')
    assert(hasCogneeConfiguration({ baseUrl: ' http://localhost:8000 ' }) === true, 'Expected self-hosted Cognee URL to be available')
    assert(hasCogneeConfiguration({ serverApiKeyPresent: true }) === true, 'Expected server-managed Cognee API key to be available')
  })

  await test('request payload maps geminiApiKey to gemini', () => {
    localStorage.clear()
    writeStoredByokKeys({
      openai: 'openai-test',
      anthropic: 'anthropic-test',
      geminiApiKey: 'gemini-test',
      xai: 'xai-test',
      ollamaBaseUrl: 'http://localhost:11434',
      openaiCompatibleApiKey: 'compat-test',
      openaiCompatibleBaseUrl: 'http://127.0.0.1:1234/v1',
      openaiCompatibleDefaultModel: 'local-model',
    })
    const payload = byokForRequest()
    assert(payload.openai === 'openai-test', 'Expected OpenAI key in request payload')
    assert(payload.anthropic === 'anthropic-test', 'Expected Anthropic key in request payload')
    assert(payload.gemini === 'gemini-test', 'Expected Gemini key to map from geminiApiKey')
    assert(payload.xai === 'xai-test', 'Expected xAI key in request payload')
    assert(payload.ollamaBaseUrl === 'http://localhost:11434', 'Expected Ollama base URL in request payload')
    assert(payload.openaiCompatibleApiKey === 'compat-test', 'Expected OpenAI-compatible key in request payload')
    assert(payload.openaiCompatibleBaseUrl === 'http://127.0.0.1:1234/v1', 'Expected OpenAI-compatible base URL in request payload')
    assert(payload.openaiCompatibleDefaultModel === 'local-model', 'Expected OpenAI-compatible default model in request payload')
    assert(!(payload as any).geminiApiKey, 'Expected storage-only geminiApiKey field to stay out of request payload')
  })

  await test('detectProviderKeyMismatch catches obvious provider swaps', () => {
    const openAiMismatch = detectProviderKeyMismatch('openai', 'sk-ant-api03-test-value')
    assert(openAiMismatch?.detectedProvider === 'anthropic', 'Expected Anthropic key shape to be rejected for OpenAI')

    const geminiMismatch = detectProviderKeyMismatch('gemini', 'sk-proj-test-value')
    assert(geminiMismatch?.detectedProvider === 'openai', 'Expected OpenAI key shape to be rejected for Gemini')

    const noMismatch = detectProviderKeyMismatch('gemini', 'AIzaSyExampleGoogleKey1234567890')
    assert(noMismatch === null, 'Expected Gemini-shaped key to be accepted for Gemini')

    const openRouterMismatch = detectProviderKeyMismatch('openai', 'sk-or-v1-test-value')
    assert(openRouterMismatch?.detectedProvider === 'openrouter', 'Expected OpenRouter key shape to be rejected for OpenAI')

    const openRouterMatch = detectProviderKeyMismatch('openrouter', 'sk-or-v1-test-value')
    assert(openRouterMatch === null, 'Expected OpenRouter-shaped key to be accepted for OpenRouter')

    const xaiMismatch = detectProviderKeyMismatch('openai', 'xai-test-value')
    assert(xaiMismatch?.detectedProvider === 'xai', 'Expected xAI key shape to be rejected for OpenAI')

    const xaiMatch = detectProviderKeyMismatch('xai', 'xai-test-value')
    assert(xaiMatch === null, 'Expected xAI-shaped key to be accepted for xAI')
  })

  await test('refreshModelsWithByok posts request-shaped provider keys', async () => {
    localStorage.clear()
    writeStoredByokKeys({
      openai: 'openai-test',
      anthropic: 'anthropic-test',
      geminiApiKey: 'gemini-test',
      xai: 'xai-test',
      ollamaBaseUrl: 'http://localhost:11434',
      openaiCompatibleApiKey: 'compat-test',
      openaiCompatibleBaseUrl: 'http://127.0.0.1:1234/v1',
      openaiCompatibleDefaultModel: 'local-model',
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
    assert(requestBody?.xai === 'xai-test', 'Expected refresh request to include xAI key')
    assert(!('geminiApiKey' in (requestBody || {})), 'Expected refresh request to omit geminiApiKey storage field')
    assert(requestBody?.ollamaBaseUrl === 'http://localhost:11434', 'Expected refresh request to include Ollama base URL')
    assert(requestBody?.openaiCompatibleApiKey === 'compat-test', 'Expected refresh request to include OpenAI-compatible key')
    assert(requestBody?.openaiCompatibleBaseUrl === 'http://127.0.0.1:1234/v1', 'Expected refresh request to include OpenAI-compatible base URL')
    assert(requestBody?.openaiCompatibleDefaultModel === 'local-model', 'Expected refresh request to include OpenAI-compatible default model')
  })

  await test('save does not auto-validate every configured provider', () => {
    assert(shouldAutoValidateByokOnSave() === false, 'Expected BYOK save to persist settings without global provider validation')
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
