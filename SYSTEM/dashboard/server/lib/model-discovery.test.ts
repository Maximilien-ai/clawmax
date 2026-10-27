import { __test, clearModelCache, discoverModels, getAvailableModelsCached, FALLBACK_OPENAI } from './model-discovery'
import { getOpenAIModelRetirement } from './openai-model-retirements'
import { modelDiscoveryEndpoint, ModelEndpointPolicyError } from './model-endpoint-policy'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0
let testChain: Promise<void> = Promise.resolve()
const originalFetch = global.fetch
const originalOrigins = process.env.CLAWMAX_MODEL_ENDPOINT_ORIGINS
process.env.CLAWMAX_MODEL_ENDPOINT_ORIGINS = 'https://models.example.com,https://ollama.example.invalid,https://compatible.example.invalid'

function test(name: string, fn: () => void | Promise<void>) {
  testChain = testChain.then(async () => {
    try {
      await fn()
      console.log(`${GREEN}✓${RESET} ${name}`)
      testsPassed++
    } catch (err: any) {
      console.log(`${RED}✗${RESET} ${name}`)
      console.log(`  Error: ${err.message}`)
      testsFailed++
    }
  })
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

console.log(`\n${YELLOW}=== Model Discovery Test Suite ===${RESET}\n`)

test('model endpoint policy confines origins and does not forward credentials to arbitrary servers', async () => {
  for (const value of ['http://169.254.169.254/latest/meta-data', 'http://2130706433:3001/api',
    'https://unapproved.example/v1', 'https://models.example.com.attacker.invalid/v1',
    'https://user:secret@models.example.com/v1', 'file:///etc/passwd',
    'https://models.example.com/v1?token=secret', 'https://models.example.com/v1#fragment']) {
    let rejected = false
    try { modelDiscoveryEndpoint(value, '/models') } catch (error) { rejected = error instanceof ModelEndpointPolicyError }
    assert(rejected, 'Expected forbidden endpoint rejection')
  }
  assert(modelDiscoveryEndpoint('https://models.example.com//another-service', '/models') === 'https://models.example.com//another-service/models', 'Double slash in path must not change the trusted origin')
  let requests = 0
  global.fetch = (async (url: string, init: any) => {
    if (String(url).includes('unapproved.example') || init?.headers?.Authorization?.includes('private-key')) requests++
    throw new Error('Synthetic offline provider')
  }) as any
  let rejected = false
  try { await discoverModels({ openaiCompatibleBaseUrl: 'https://unapproved.example', openaiCompatibleApiKey: 'private-key' }) } catch (error) { rejected = error instanceof ModelEndpointPolicyError }
  assert(rejected && requests === 0, 'No unapproved discovery request or credentials may leave the server')
})

test('OpenAI discovery preserves active older and newer provider-advertised chat models', () => {
  const filtered = __test.filterCompatibleDiscoveredModels('openai', [
    'openai/gpt-5',
    'openai/gpt-5.5',
    'openai/gpt-4.1',
    'openai/gpt-4o-mini',
  ])
  assert(filtered.includes('openai/gpt-5'), 'Expected discovered gpt-5 alias')
  assert(filtered.includes('openai/gpt-4.1'), 'Expected discovered gpt-4.1 alias')
  assert(filtered.includes('openai/gpt-5.5'), 'Expected approved gpt-5.5')
})

test('OpenAI discovery never treats the offline fallback as an allowlist, including show-all', () => {
  const approved = ['openai/gpt-5.5']
  assert(JSON.stringify(FALLBACK_OPENAI) === JSON.stringify(approved), 'Fallback must only offer approved GPT-5.5')
  for (const showAll of [false, true]) {
    const filtered = __test.filterCompatibleDiscoveredModels('openai', [
      ...approved, 'openai/gpt-5.3', 'openai/gpt-5.3-codex',
      'openai/gpt-5.4', 'openai/gpt-5.4-mini', 'openai/gpt-5.4-nano', 'openai/gpt-5.4-pro',
      'openai/gpt-5.5-invented', 'openai/o3', 'openai/gpt-5.40', 'openai/gpt-5',
    ], showAll)
    assert(filtered.length === 11, 'All supplied chat model ids must remain selectable without hardcoded admission')
  }
})

test('retired OpenAI models stay hidden in normal and advanced catalogs', () => {
  const retired = ['gpt-4', 'gpt-4-0613', 'gpt-4-turbo', 'gpt-4-turbo-2024-04-09',
    'gpt-3.5-turbo', 'gpt-3.5-turbo-0125', 'gpt-4.5-preview', 'gpt-4.1-nano',
    'gpt-4o-2024-05-13', 'chatgpt-4o-latest', 'gpt-5.3-chat-latest', 'o3-mini']
    .map(id => `openai/${id}`)
  const active = ['openai/gpt-4o', 'openai/gpt-4o-mini', 'openai/gpt-4.1', 'openai/gpt-4.1-mini', 'openai/gpt-5.5']
  for (const showAll of [false, true]) {
    const result = __test.filterCompatibleDiscoveredModels('openai', [...retired, ...active], showAll)
    assert(JSON.stringify(result) === JSON.stringify(active), 'Only retired models should be removed')
  }
  const compatible = __test.filterCompatibleDiscoveredModels('openai-compatible', ['openai-compatible/gpt-4'])
  assert(compatible.length === 1, 'Other providers own their model lifecycles')
})

test('shutdown dates automatically change lifecycle status at the UTC boundary', () => {
  assert(getOpenAIModelRetirement('openai/gpt-4.1', Date.parse('2027-01-13T23:59:59Z'))?.status === 'deprecated', 'Must remain usable before shutdown')
  assert(getOpenAIModelRetirement('openai/gpt-4.1', Date.parse('2027-01-14T00:00:00Z'))?.status === 'retired', 'Must retire on schedule')
  assert(getOpenAIModelRetirement('openai-compatible/gpt-4') === null, 'Must not classify compatible-provider models')
})

test('BYOK discovery filters retired models on initial fetch and warm-cache reads', async () => {
  clearModelCache()
  const originalNow = Date.now
  let calls = 0
  global.fetch = (async (input: any) => {
    if (String(input) === 'https://api.openai.com/v1/models') calls++
    return { ok: true, status: 200, json: async () => ({ data: [{ id: 'gpt-4' }, { id: 'gpt-4.1' }, { id: 'gpt-5.5' }] }) } as any
  }) as any
  try {
    Date.now = () => Date.parse('2027-01-13T23:59:59Z')
    const first = await discoverModels({ openai: 'retirement-fixture' })
    assert(!first.modelsByProvider.openai.models.includes('openai/gpt-4'), 'Retired model must be removed on fetch')
    assert(first.modelsByProvider.openai.models.includes('openai/gpt-4.1'), 'Upcoming shutdown must remain usable')
    Date.now = () => Date.parse('2027-01-14T00:00:00Z')
    const cached = await discoverModels({ openai: 'retirement-fixture' }, { showAll: true })
    assert(calls === 1, 'Expected a warm catalog crossing the retirement boundary')
    assert(JSON.stringify(cached.modelsByProvider.openai.models) === JSON.stringify(['openai/gpt-5.5']), 'Warm cache and show-all must not restore retired models')
    const validationCatalog = getAvailableModelsCached({ SYSTEM_OPENAI_API_KEY: 'retirement-fixture' })
    assert(!validationCatalog.includes('openai/gpt-4.1') && validationCatalog.includes('openai/gpt-5.5'), 'Synchronous validation must recheck cached retirement dates too')
  } finally {
    Date.now = originalNow
    clearModelCache()
  }
})

test('Ollama models are never compatibility filtered', () => {
  const filtered = __test.filterCompatibleDiscoveredModels('ollama', [
    'ollama/qwen2.5:latest',
    'ollama/llama3.2:latest',
  ])
  assert(filtered.length === 2, `Expected both Ollama models, got ${filtered.length}`)
})

test('Gemini discovery exposes hosted Gemma and excludes local QAT checkpoints', () => {
  assert(__test.isGeminiApiTextModel('gemma-4-31b-it'), 'Expected hosted Gemma instruction model')
  assert(!__test.isGeminiApiTextModel('gemma-4-31b-qat'), 'Did not expect a local QAT checkpoint from Gemini API discovery')
  const filtered = __test.filterCompatibleDiscoveredModels('gemini', [
    'google/gemini-2.5-flash',
    'google/gemma-4-31b-it',
    'google/gemma-4-31b-qat',
  ])
  assert(filtered.includes('google/gemma-4-31b-it'), 'Expected hosted Gemma model to remain selectable')
  assert(!filtered.includes('google/gemma-4-31b-qat'), 'Expected local QAT model to stay hidden')
})

test('OpenAI-compatible discovery hides obvious embedding-only models by default', () => {
  const filtered = __test.filterCompatibleDiscoveredModels('openai-compatible', [
    'openai-compatible/text-embedding-nomic-embed-text-v1.5',
    'openai-compatible/qwen3-8b',
  ])
  assert(filtered.length === 1, `Expected one chat-capable OpenAI-compatible model, got ${filtered.length}`)
  assert(filtered[0] === 'openai-compatible/qwen3-8b', `Expected qwen3-8b to remain visible, got ${filtered[0]}`)
})

test('OpenAI-compatible show-all mode preserves filtered advanced models', () => {
  const filtered = __test.filterCompatibleDiscoveredModels('openai-compatible', [
    'openai-compatible/text-embedding-nomic-embed-text-v1.5',
    'openai-compatible/qwen3-8b',
  ], true)
  assert(filtered.length === 2, `Expected both OpenAI-compatible models in show-all mode, got ${filtered.length}`)
})

test('OpenRouter discovery preserves native provider/model namespaces', () => {
  const filtered = __test.filterCompatibleDiscoveredModels('openrouter', [
    'openrouter/auto',
    'openrouter/anthropic/claude-sonnet-4',
    'openrouter/openai/text-embedding-3-small',
  ])
  assert(filtered.includes('openrouter/auto'), 'Expected OpenRouter automatic router')
  assert(filtered.includes('openrouter/anthropic/claude-sonnet-4'), 'Expected nested OpenRouter provider/model id')
  assert(!filtered.includes('openrouter/openai/text-embedding-3-small'), 'Expected embedding-only OpenRouter model filtered')
})

test('discoverModels loads LM Studio models from an OpenAI-compatible endpoint', async () => {
  clearModelCache()
  global.fetch = (async (url: string) => {
    if (url === 'https://api.openai.com/v1/models') {
      return { ok: true, status: 200, json: async () => ({ data: [{ id: 'gpt-5' }] }) } as any
    }
    assert(url === 'http://127.0.0.1:1234/v1/models', `Expected LM Studio models endpoint, got ${url}`)
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: 'text-embedding-nomic-embed-text-v1.5' }, { id: 'granite-3.3-8b-instruct' }, { id: 'qwen3-8b' }] }),
    } as any
  }) as any

  const result = await discoverModels({
    openaiCompatibleBaseUrl: 'http://127.0.0.1:1234/v1',
  })

  assert(result.modelsByProvider['openai-compatible']?.models.includes('openai-compatible/granite-3.3-8b-instruct'), 'Expected granite LM Studio model')
  assert(result.modelsByProvider['openai-compatible']?.models.includes('openai-compatible/qwen3-8b'), 'Expected second LM Studio model')
  assert(!result.modelsByProvider['openai-compatible']?.models.includes('openai-compatible/text-embedding-nomic-embed-text-v1.5'), 'Did not expect embedding model in default compatible discovery')
})

test('discovery normalizes very long trailing separators without a backtracking expression', async () => {
  clearModelCache()
  const requests: string[] = []
  global.fetch = (async (url: string) => {
    requests.push(String(url))
    return { ok: true, json: async () => ({ data: [{ id: 'fixture' }], models: [{ name: 'fixture' }] }) } as any
  }) as any
  const suffix = '/'.repeat(100000)
  await discoverModels({ ollamaBaseUrl: `http://127.0.0.1:11434${suffix}`, openaiCompatibleBaseUrl: `http://127.0.0.1:1234/v1${suffix}` })
  assert(requests.includes('http://127.0.0.1:11434/api/tags'), 'Expected normalized Ollama URL')
  assert(requests.includes('http://127.0.0.1:1234/v1/models'), 'Expected normalized compatible URL')
  clearModelCache()
})

test('discoverModels loads Ollama models from the local tags endpoint', async () => {
  clearModelCache()
  global.fetch = (async (url: string, init: any) => {
    if (url === 'https://api.openai.com/v1/models') {
      return { ok: true, status: 200, json: async () => ({ data: [{ id: 'gpt-5' }] }) } as any
    }
    assert(url === 'http://127.0.0.1:11434/api/tags', `Expected Ollama tags endpoint, got ${url}`)
    assert(init.redirect === 'error', 'Discovery must not follow model-service redirects')
    return {
      ok: true,
      status: 200,
      json: async () => ({ models: [{ name: 'qwen2.5:latest' }, { name: 'llama3.2:latest' }] }),
    } as any
  }) as any

  const result = await discoverModels({
    ollamaBaseUrl: 'http://127.0.0.1:11434',
  }, { showAll: true })

  assert(result.modelsByProvider.ollama?.models.includes('ollama/qwen2.5:latest'), 'Expected qwen Ollama model')
  assert(result.modelsByProvider.ollama?.models.includes('ollama/llama3.2:latest'), 'Expected llama Ollama model')
})

test('discoverModels loads native OpenRouter model ids from its hosted catalog', async () => {
  clearModelCache()
  global.fetch = (async (url: string) => {
    if (url === 'https://api.openai.com/v1/models') {
      return { ok: true, status: 200, json: async () => ({ data: [{ id: 'gpt-5' }] }) } as any
    }
    assert(url === 'https://openrouter.ai/api/v1/models', `Expected OpenRouter models endpoint, got ${url}`)
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: 'anthropic/claude-sonnet-4' }, { id: 'openai/text-embedding-3-small' }] }),
    } as any
  }) as any

  const result = await discoverModels({ openrouter: 'sk-or-test' })

  assert(result.modelsByProvider.openrouter?.models.includes('openrouter/auto'), 'Expected OpenRouter automatic router fallback')
  assert(result.modelsByProvider.openrouter?.models.includes('openrouter/anthropic/claude-sonnet-4'), 'Expected native OpenRouter model id')
  assert(!result.modelsByProvider.openrouter?.models.includes('openrouter/openai/text-embedding-3-small'), 'Expected embedding-only OpenRouter model hidden')
})

test('xAI discovery preserves newly advertised chat models without a static allowlist', async () => {
  clearModelCache()
  global.fetch = (async (url: string) => {
    if (url === 'https://api.openai.com/v1/models') {
      return { ok: true, status: 200, json: async () => ({ data: [{ id: 'gpt-5' }] }) } as any
    }
    assert(url === 'https://api.x.ai/v1/models', `Expected xAI models endpoint, got ${url}`)
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: [
        { id: 'grok-3' },
        { id: 'grok-4.3' },
        { id: 'grok-4.5' },
        { id: 'v1' },
      ] }),
    } as any
  }) as any

  const result = await discoverModels({ xai: 'xai-test' })
  const models = result.modelsByProvider.xai?.models || []

  assert(models.includes('xai/grok-3'), 'Expected compatible Grok model')
  assert(models.includes('xai/grok-4.3'), 'Expected compatible Grok 4.3 model')
  assert(models.includes('xai/grok-4.5'), 'Expected provider-advertised Grok 4.5')
  assert(!models.includes('xai/v1'), 'Did not expect non-Grok endpoint id')
})

test('cloud discovery never probes local model endpoints but retains remote-compatible models', async () => {
  const previousKind = process.env.DASHBOARD_DEPLOYMENT_KIND
  process.env.DASHBOARD_DEPLOYMENT_KIND = 'cloud'
  try {
    clearModelCache()
    const requests: string[] = []
    global.fetch = (async (url: string) => {
      requests.push(String(url))
      return { ok: true, status: 200, json: async () => ({ data: [{ id: 'remote-model' }] }) } as any
    }) as any
    await discoverModels({ ollamaBaseUrl: 'http://localhost:11434', openaiCompatibleBaseUrl: 'http://host.containers.internal:1234/v1' })
    assert(!requests.some(url => url.includes('localhost') || url.includes('host.containers.internal')), 'Cloud must not probe machine-local model endpoints')
    requests.length = 0
    await discoverModels({ openaiCompatibleBaseUrl: 'https://models.example.com/v1' })
    assert(requests.includes('https://models.example.com/v1/models'), 'Cloud must still discover remote-compatible models')
  } finally {
    if (previousKind === undefined) delete process.env.DASHBOARD_DEPLOYMENT_KIND
    else process.env.DASHBOARD_DEPLOYMENT_KIND = previousKind
    clearModelCache()
  }
})

test('all providers recover from HTTP, malformed JSON and empty discovery results', async () => {
  const keys = { openai: 'fixture', anthropic: 'fixture', gemini: 'fixture', openrouter: 'fixture', xai: 'fixture', ollamaBaseUrl: 'https://ollama.example.invalid', openaiCompatibleBaseUrl: 'https://compatible.example.invalid/v1' }
  const previousKind = process.env.DASHBOARD_DEPLOYMENT_KIND
  process.env.DASHBOARD_DEPLOYMENT_KIND = 'local'
  try {
    for (const mode of ['http-error', 'network-error', 'json-error', 'empty', 'missing']) {
      clearModelCache()
      let calls = 0
      global.fetch = (async () => {
        calls++
        if (mode === 'network-error') throw new Error('Synthetic offline provider')
        return { ok: mode !== 'http-error', status: 503, json: async () => {
          if (mode === 'json-error') throw new Error('Synthetic malformed JSON')
          return mode === 'missing' ? {} : { data: [], models: [] }
        } }
      }) as any
      const result = await discoverModels(keys, { showAll: true })
      assert(calls === 7, `Expected all seven isolated provider requests for ${mode}, got ${calls}`)
      assert(result.models.includes('openai/gpt-5.5'), `Expected OpenAI fallback for ${mode}`)
      assert(!result.models.some(model => model.startsWith('ollama/') || model.startsWith('openai-compatible/')), 'Failed local/compatible discovery must not invent models')
    }
  } finally {
    if (previousKind === undefined) delete process.env.DASHBOARD_DEPLOYMENT_KIND
    else process.env.DASHBOARD_DEPLOYMENT_KIND = previousKind
    clearModelCache()
  }
})

test('provider discovery caches valid catalogs and filters malformed optional model entries', async () => {
  const previousKind = process.env.DASHBOARD_DEPLOYMENT_KIND
  process.env.DASHBOARD_DEPLOYMENT_KIND = 'local'
  const originalNow = Date.now
  const keys = { openai: 'fixture', anthropic: 'fixture', gemini: 'fixture', openrouter: 'fixture', xai: 'fixture', ollamaBaseUrl: 'https://ollama.example.invalid/', openaiCompatibleBaseUrl: 'https://compatible.example.invalid/v1/', openaiCompatibleApiKey: ' compatible-key ' }
  let calls = 0
  clearModelCache()
  global.fetch = (async (input: any, init: any) => {
    calls++
    const url = String(input)
    if (url.includes('compatible.example.invalid')) assert(init.headers.Authorization === 'Bearer compatible-key', 'Expected trimmed compatible credential')
    const body = url.includes('anthropic') ? { data: [{ id: 'claude-sonnet-4-6' }] }
      : url.includes('generativelanguage') ? { models: [{ name: 'models/gemini-2.5-flash' }, { name: 'models/embedding-001' }] }
      : url.includes('ollama') ? { models: [{}, { name: ' fixture-model ' }] }
      : new URL(url).hostname === 'api.openai.com' ? { data: [{ id: 'gpt-5.5' }, { id: 'gpt-5.4-mini' }, { id: 'text-embedding-3-small' }] }
      : { data: [{}, { id: ' fixture-model ' }, { id: 'grok-4' }] }
    return { ok: true, status: 200, json: async () => body }
  }) as any
  try {
    const first = await discoverModels(keys, { showAll: true })
    assert(first.models.includes('ollama/fixture-model'), 'Expected trimmed Ollama model')
    assert(first.models.includes('openai-compatible/fixture-model'), 'Expected compatible model')
    assert(first.models.includes('openai/gpt-5.5'), 'Expected approved OpenAI model')
    assert(first.models.includes('openai/gpt-5.4-mini'), 'Older discovered OpenAI models must remain available')
    const firstCalls = calls
    await discoverModels(keys, { showAll: true })
    assert(calls === firstCalls, 'Valid provider catalogs should be cached')
    Date.now = () => originalNow() + 2 * 60 * 60 * 1000
    await discoverModels(keys, { showAll: true })
    assert(calls === firstCalls * 2, 'Expired provider catalogs should refresh')
  } finally {
    Date.now = originalNow
    if (previousKind === undefined) delete process.env.DASHBOARD_DEPLOYMENT_KIND
    else process.env.DASHBOARD_DEPLOYMENT_KIND = previousKind
    clearModelCache()
  }
})

test('a model list is cached for the key that fetched it, and the Gemini key never goes into a URL', async () => {
  const previousKind = process.env.DASHBOARD_DEPLOYMENT_KIND
  process.env.DASHBOARD_DEPLOYMENT_KIND = 'local'
  const requests: Array<{ url: string; credential: string }> = []
  clearModelCache()
  global.fetch = (async (input: any, init: any) => {
    const url = String(input)
    const credential = String(init?.headers?.Authorization || init?.headers?.['x-goog-api-key'] || '')
    requests.push({ url, credential })
    const second = credential.includes('key-two')
    const body = url.includes('generativelanguage')
      ? { models: [{ name: second ? 'models/gemini-2.5-pro' : 'models/gemini-2.5-flash' }] }
      : { data: [{ id: second ? 'gpt-5.5' : 'gpt-5.4-mini' }] }
    return { ok: true, status: 200, json: async () => body }
  }) as any
  try {
    const one = await discoverModels({ openai: 'key-one', gemini: 'key-one' }, { showAll: true })
    const two = await discoverModels({ openai: 'key-two', gemini: 'key-two' }, { showAll: true })
    assert(one.models.includes('openai/gpt-5.4-mini') && one.models.includes('google/gemini-2.5-flash'), 'Expected the first key\'s lists')
    assert(two.models.includes('openai/gpt-5.5') && !two.models.includes('openai/gpt-5.4-mini'), 'A second key must get its own OpenAI list, not the first key\'s cached one')
    assert(two.models.includes('google/gemini-2.5-pro') && !two.models.includes('google/gemini-2.5-flash'), 'A second key must get its own Gemini list')
    const gemini = requests.filter((request) => request.url.includes('generativelanguage'))
    assert(gemini.length === 2 && gemini.every((request) => !request.url.includes('key')), `The Gemini key must not be in a URL: ${gemini.map((request) => request.url).join(', ')}`)
    assert(gemini.map((request) => request.credential).join(',') === 'key-one,key-two', 'Expected the Gemini key in the x-goog-api-key header')
  } finally {
    if (previousKind === undefined) delete process.env.DASHBOARD_DEPLOYMENT_KIND
    else process.env.DASHBOARD_DEPLOYMENT_KIND = previousKind
    clearModelCache()
  }
})

testChain.then(() => {
  global.fetch = originalFetch
  if (originalOrigins === undefined) delete process.env.CLAWMAX_MODEL_ENDPOINT_ORIGINS
  else process.env.CLAWMAX_MODEL_ENDPOINT_ORIGINS = originalOrigins
  console.log(`\nTests passed: ${testsPassed}`)
  console.log(`Tests failed: ${testsFailed}`)

  if (testsFailed > 0) {
    console.log(`\n${RED}Some tests failed${RESET}`)
    process.exit(1)
  } else {
    console.log(`\n${GREEN}All tests passed${RESET}`)
  }
})
