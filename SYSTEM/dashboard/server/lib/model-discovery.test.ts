import { resolveOpenAiCompatibleDefaultModel, getCachedOpenAiCompatibleDefaultModel, resolveOpenAiCompatibleEndpoint, normalizeOpenAiCompatibleBaseUrl, getCachedOpenAiCompatibleContextWindow, __test, clearModelCache, discoverModels, getAvailableModelsCached, FALLBACK_OPENAI } from './model-discovery'
import { getOpenAIModelRetirement } from './openai-model-retirements'
import { modelDiscoveryEndpoint, ModelEndpointPolicyError } from './model-endpoint-policy'
import { setOpenClawModelCatalogForTests } from './openclaw-model-catalog'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0
let testChain: Promise<void> = Promise.resolve()
const originalFetch = global.fetch
const originalOrigins = process.env.CLAWMAX_MODEL_ENDPOINT_ORIGINS
const originalKind = process.env.DASHBOARD_DEPLOYMENT_KIND
process.env.DASHBOARD_DEPLOYMENT_KIND = 'local'
const fixtureOrigins = [
  'https://models.example.com', 'https://ollama.example.invalid', 'https://compatible.example.invalid',
  'http://172.16.1.70:8000', 'http://shared-gateway:8000', 'http://gateway:8000',
  'http://busy-endpoint:8000',
  ...Array.from({ length: 300 }, (_, i) => `http://10.0.0.${i % 250}:${8000 + Math.floor(i / 250)}`),
  'http://after-grace:8000', 'http://refresh-endpoint:8000', 'http://evict-endpoint:8000',
  ...Array.from({ length: 301 }, (_, i) => `http://endpoint-${i}:8000`),
  ...Array.from({ length: 300 }, (_, i) => `http://concurrent-${i}:8000`),
  ...Array.from({ length: 1100 }, (_, i) => `http://flood-${i}:8000`),
  ...Array.from({ length: 40 }, (_, i) => `http://burst-${i}:8000`),
]
process.env.CLAWMAX_MODEL_ENDPOINT_ORIGINS = fixtureOrigins.join(',')
// These fixtures describe provider discovery. Pin "no readable runtime catalog" so an OpenClaw
// installed on the machine cannot narrow them; runtime-catalog filtering is tested on its own below.
setOpenClawModelCatalogForTests(null)

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

test('cache identities are stable within a process and separate providers and credentials', () => {
  const first = __test.keyedCacheKey('openai', 'fixture-key-one')
  assert(first === __test.keyedCacheKey('openai', ' fixture-key-one '), 'A credential must retain its cache partition')
  assert(first !== __test.keyedCacheKey('openai', 'fixture-key-two'), 'Different credentials must not share a cache partition')
  assert(first.split(':')[1] !== __test.keyedCacheKey('anthropic', 'fixture-key-one').split(':')[1], 'Provider context must separate derived identities')
  assert(!first.includes('fixture-key'), 'The cache must not retain a raw credential in its key')
})

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

test('OpenAI discovery keeps image, speech and transcription models out of the agent chat picker', () => {
  // With retired chatgpt-4o-latest removed, chatgpt-image-latest sorted first and became the
  // first-listed default for ordinary text agents.
  const discovered = ['chatgpt-4o-latest', 'chatgpt-image-latest', 'gpt-4o-mini-transcribe', 'gpt-4o-mini-tts',
    'gpt-4o-transcribe', 'gpt-image-1', 'gpt-image-1-mini', 'gpt-5.4-mini', 'gpt-5.5'].map(id => `openai/${id}`)
  const chat = __test.filterCompatibleDiscoveredModels('openai', discovered)
  assert(JSON.stringify(chat) === JSON.stringify(['openai/gpt-5.4-mini', 'openai/gpt-5.5']), `Only chat models belong in the picker, got ${chat.join(', ')}`)
  const all = __test.filterCompatibleDiscoveredModels('openai', discovered, true)
  assert(!all.includes('openai/chatgpt-image-latest') && all.includes('openai/gpt-4o-mini-tts'), 'Advanced mode retains speech entries while the RC96 image-only safety filter remains enforced')
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

test('An OpenAI-compatible endpoint with no configured default model resolves its own first chat model', async () => {
  clearModelCache()
  global.fetch = (async (url: string) => {
    assert(url === 'http://172.16.1.70:8000/v1/models', `Expected the configured endpoint, got ${url}`)
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: 'text-embedding-nomic-embed-text-v1.5' }, { id: 'deepseek-ai/DeepSeek-V4-Flash-0731' }] }),
    } as any
  }) as any

  const resolved = await resolveOpenAiCompatibleDefaultModel({ baseUrl: 'http://172.16.1.70:8000/v1' })
  assert(resolved === 'deepseek-ai/DeepSeek-V4-Flash-0731', `Expected the endpoint's own chat model, got ${resolved}`)
  assert(
    getCachedOpenAiCompatibleDefaultModel('http://172.16.1.70:8000/v1/') === 'deepseek-ai/DeepSeek-V4-Flash-0731',
    'Expected the cached read to answer with the same model regardless of a trailing slash',
  )
})

test('A configured default model outranks whatever the endpoint advertises', async () => {
  clearModelCache()
  global.fetch = (async () => {
    throw new Error('Discovery must not run when the operator named a model')
  }) as any

  const resolved = await resolveOpenAiCompatibleDefaultModel({
    baseUrl: 'http://172.16.1.70:8000/v1',
    defaultModel: 'openai-compatible/operator-choice',
  })
  assert(resolved === 'operator-choice', `Expected the operator's model without its provider prefix, got ${resolved}`)
})

test('An endpoint advertising only non-chat models resolves to no default', async () => {
  clearModelCache()
  global.fetch = (async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: [{ id: 'text-embedding-nomic-embed-text-v1.5' }] }),
  }) as any) as any

  const resolved = await resolveOpenAiCompatibleDefaultModel({ baseUrl: 'http://172.16.1.70:8000/v1' })
  assert(resolved === undefined, `Expected no chat-capable default, got ${resolved}`)
})

test('An endpoint that just failed is not asked again within the discovery timeout', async () => {
  clearModelCache()
  let attempts = 0
  global.fetch = (async () => {
    attempts++
    throw new Error('connect ECONNREFUSED 172.16.1.70:8000')
  }) as any

  const first = await resolveOpenAiCompatibleDefaultModel({ baseUrl: 'http://172.16.1.70:8000/v1' })
  const second = await resolveOpenAiCompatibleDefaultModel({ baseUrl: 'http://172.16.1.70:8000/v1' })
  assert(first === undefined && second === undefined, `Expected no default from an unreachable endpoint, got ${first}/${second}`)
  assert(attempts === 1, `Expected the warm-up and the execution that follows it to share one failed attempt, got ${attempts}`)

  // A different credential for the same server is its own lookup.
  await resolveOpenAiCompatibleDefaultModel({ baseUrl: 'http://172.16.1.70:8000/v1', apiKey: 'other-key' })
  assert(attempts === 2, `Expected a separate attempt for a different credential, got ${attempts}`)

  // Once the window has passed the endpoint is asked again.
  __test.ageOpenAiCompatibleCache(6_000)
  await resolveOpenAiCompatibleDefaultModel({ baseUrl: 'http://172.16.1.70:8000/v1' })
  assert(attempts === 3, `Expected a fresh attempt after the replay window, got ${attempts}`)

  // A failure never shadows a later success or an emptied cache.
  clearModelCache()
  global.fetch = (async () => ({ ok: true, status: 200, json: async () => ({ data: [{ id: 'deepseek-ai/DeepSeek-V4-Flash-0731' }] }) }) as any) as any
  const recovered = await resolveOpenAiCompatibleDefaultModel({ baseUrl: 'http://172.16.1.70:8000/v1' })
  assert(recovered === 'deepseek-ai/DeepSeek-V4-Flash-0731', `Expected discovery to recover after the cache is cleared, got ${recovered}`)
})

test('A lookup that outlived a refresh cannot hide the fresh attempt in flight', async () => {
  clearModelCache()
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
  global.fetch = (async () => {
    await wait(100)
    throw new Error('connect ETIMEDOUT 172.16.1.70:8000')
  }) as any
  const stale = resolveOpenAiCompatibleDefaultModel({ baseUrl: 'http://172.16.1.70:8000/v1' })
  await wait(10)
  clearModelCache() // the operator's refresh, while the stale lookup is still waiting
  global.fetch = (async () => {
    await wait(300)
    return { ok: true, status: 200, json: async () => ({ data: [{ id: 'deepseek-ai/DeepSeek-V4-Flash-0731' }] }) } as any
  }) as any
  const fresh = resolveOpenAiCompatibleDefaultModel({ baseUrl: 'http://172.16.1.70:8000/v1' })
  await wait(200) // the stale lookup has failed by now; the fresh one is still in flight
  const joined = await resolveOpenAiCompatibleDefaultModel({ baseUrl: 'http://172.16.1.70:8000/v1' })
  assert(joined === 'deepseek-ai/DeepSeek-V4-Flash-0731', `Expected the caller to join the fresh attempt rather than replay the stale failure, got ${joined}`)
  assert((await stale) === undefined && (await fresh) === 'deepseek-ai/DeepSeek-V4-Flash-0731', 'Expected the stale lookup to fail and the fresh one to succeed')
  assert(__test.openAiCompatibleFailureCount() === 0, `Expected no failure recorded for the refreshed generation, got ${__test.openAiCompatibleFailureCount()}`)
})

test('The failure window holds no more entries than the endpoint cache', async () => {
  clearModelCache()
  global.fetch = (async () => { throw new Error('connect ECONNREFUSED') }) as any
  for (let i = 0; i < 300; i++) {
    await resolveOpenAiCompatibleDefaultModel({ baseUrl: `http://10.0.0.${i % 250}:${8000 + Math.floor(i / 250)}/v1` })
  }
  assert(__test.openAiCompatibleFailureCount() <= 256, `Expected the failure window to stay bounded, got ${__test.openAiCompatibleFailureCount()}`)
})

test('A cold discovery cache answers undefined rather than guessing', () => {
  clearModelCache()
  assert(
    getCachedOpenAiCompatibleDefaultModel('http://172.16.1.70:8000/v1') === undefined,
    'Expected no answer from an unwarmed cache',
  )
})

test('concurrent cold lookups issue one request and preserve endpoint order', async () => {
  clearModelCache()
  let requests = 0
  global.fetch = (async () => {
    requests++
    await new Promise(r => setTimeout(r, 30))
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: 'zeta-chat-model' }, { id: 'alpha-chat-model' }] }),
    } as any
  }) as any

  const resolved = await Promise.all(Array.from({ length: 8 }, () =>
    resolveOpenAiCompatibleDefaultModel({ baseUrl: 'http://busy-endpoint:8000/v1' })))
  assert(requests === 1, `Expected one coalesced /models request, got ${requests}`)
  assert(
    resolved.every(model => model === 'zeta-chat-model'),
    `Expected the endpoint's own first chat model, got ${JSON.stringify(resolved.slice(0, 3))}`,
  )
})

test('a workspace URL is paired with the protected credential and model configured for the same server', () => {
  const endpoint = resolveOpenAiCompatibleEndpoint([
    { baseUrl: 'http://172.16.1.70:8000/v1' },
    { baseUrl: 'HTTP://172.16.1.70:8000/v1/', apiKey: 'protected-secret', defaultModel: 'operator-model' },
  ])
  assert(endpoint?.baseUrl === 'http://172.16.1.70:8000/v1', `Expected the workspace URL to be selected, got ${endpoint?.baseUrl}`)
  assert(endpoint?.apiKey === 'protected-secret', `Expected the protected credential for the same server, got ${endpoint?.apiKey}`)
  assert(endpoint?.defaultModel === 'operator-model', `Expected the model configured with that credential, got ${endpoint?.defaultModel}`)
})

test('a credential configured for a different server is never sent to the selected endpoint', () => {
  const endpoint = resolveOpenAiCompatibleEndpoint([
    { baseUrl: 'http://workspace-endpoint:8000/v1' },
    { baseUrl: 'http://other-endpoint:8000/v1', apiKey: 'other-secret', defaultModel: 'other-model' },
  ])
  assert(endpoint?.baseUrl === 'http://workspace-endpoint:8000/v1', `Expected the workspace endpoint, got ${endpoint?.baseUrl}`)
  assert(endpoint?.apiKey === undefined, `Expected no borrowed credential, got ${endpoint?.apiKey}`)
  assert(endpoint?.defaultModel === undefined, `Expected no borrowed model, got ${endpoint?.defaultModel}`)
})

test('a browser endpoint keeps its own credential and takes no model seen through a different one', () => {
  const endpoint = resolveOpenAiCompatibleEndpoint([
    { baseUrl: 'http://shared-gateway:8000/v1', apiKey: 'browser-secret' },
    { baseUrl: 'http://shared-gateway:8000/v1', defaultModel: 'workspace-model' },
    { baseUrl: 'http://shared-gateway:8000/v1', apiKey: 'protected-secret', defaultModel: 'protected-model' },
  ])
  assert(endpoint?.apiKey === 'browser-secret', `Expected the browser's own credential, got ${endpoint?.apiKey}`)
  assert(endpoint?.defaultModel === undefined, `Expected no model from another credential's configuration, got ${endpoint?.defaultModel}`)
  const urlOnly = resolveOpenAiCompatibleEndpoint([
    { baseUrl: 'http://shared-gateway:8000/v1' },
    { baseUrl: 'http://shared-gateway:8000/v1', defaultModel: 'workspace-model' },
    { baseUrl: 'http://shared-gateway:8000/v1', apiKey: 'protected-secret' },
  ])
  assert(urlOnly?.apiKey === 'protected-secret' && urlOnly?.defaultModel === 'workspace-model', `Expected the workspace model alongside the protected credential it was configured with, got ${JSON.stringify(urlOnly)}`)
  const noCredential = resolveOpenAiCompatibleEndpoint([
    { baseUrl: 'http://shared-gateway:8000/v1' },
    { baseUrl: 'http://shared-gateway:8000/v1', defaultModel: 'workspace-model' },
  ])
  assert(noCredential?.apiKey === undefined && noCredential?.defaultModel === 'workspace-model', `Expected the workspace model with no credential in play, got ${JSON.stringify(noCredential)}`)
  assert(resolveOpenAiCompatibleEndpoint([{ baseUrl: '  ' }, undefined]) === undefined, 'Expected no endpoint without a URL')
  assert(normalizeOpenAiCompatibleBaseUrl('HTTP://Host:8000/v1/') === 'http://host:8000/v1', 'Expected scheme and host to be case-insensitive and the trailing slash dropped')
  assert(
    normalizeOpenAiCompatibleBaseUrl('http://gateway:8000/v1?tenant=a') !== normalizeOpenAiCompatibleBaseUrl('http://gateway:8000/v1?tenant=b'),
    'Expected two tenants of one host to be two endpoints',
  )
  const tenantA = resolveOpenAiCompatibleEndpoint([
    { baseUrl: 'http://gateway:8000/v1?tenant=a' },
    { baseUrl: 'http://gateway:8000/v1?tenant=b', apiKey: 'tenant-b-secret' },
  ])
  assert(tenantA?.apiKey === undefined, `Expected tenant b's credential to stay with tenant b, got ${tenantA?.apiKey}`)
})

test('cache keys carry a credential fingerprint, never the credential itself', () => {
  const withSecret = __test.openAiCompatibleCacheKey('http://shared-gateway:8000/v1', 'sk-live-very-secret-value')
  const withOther = __test.openAiCompatibleCacheKey('http://shared-gateway:8000/v1/', 'sk-live-other-value')
  const withoutKey = __test.openAiCompatibleCacheKey('http://shared-gateway:8000/v1')
  assert(!withSecret.includes('sk-live'), `Expected no raw credential in the cache key, got ${withSecret}`)
  assert(withSecret !== withOther, 'Expected two credentials to map to two cache entries')
  assert(withSecret !== withoutKey, 'Expected a credential-less read to miss a credentialed entry')
  assert(
    __test.openAiCompatibleCacheKey('http://shared-gateway:8000/v1', 'sk-live-very-secret-value') === withSecret,
    'Expected the fingerprint to be stable for the same credential',
  )
})

test('the endpoint cache keeps only the newest entries', async () => {
  clearModelCache()
  global.fetch = (async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: [{ id: 'chat-model' }] }),
  }) as any) as any
  for (let i = 0; i < 300; i++) {
    await resolveOpenAiCompatibleDefaultModel({ baseUrl: `http://endpoint-${i}:8000/v1` })
  }
  assert(__test.openAiCompatibleCacheEntryCount() === 300, `Expected fresh entries to stay beyond the bound, got ${__test.openAiCompatibleCacheEntryCount()}`)
  __test.ageOpenAiCompatibleCache(61_000)
  await resolveOpenAiCompatibleDefaultModel({ baseUrl: 'http://endpoint-300:8000/v1' })
  const count = __test.openAiCompatibleCacheEntryCount()
  assert(count === 256, `Expected the cache bounded at 256 endpoint entries once entries aged past the grace window, got ${count}`)
  assert(getCachedOpenAiCompatibleDefaultModel('http://endpoint-0:8000/v1') === undefined, 'Expected the oldest entry to have been evicted')
  assert(getCachedOpenAiCompatibleDefaultModel('http://endpoint-299:8000/v1') === 'chat-model', 'Expected a newer entry to be retained')
  // A burst larger than the bound still leaves every member readable while it is fresh: size
  // eviction never touches entries inside the grace window, only older ones once it lapses.
  clearModelCache()
  await Promise.all(Array.from({ length: 300 }, (_, i) => resolveOpenAiCompatibleDefaultModel({ baseUrl: `http://concurrent-${i}:8000/v1` })))
  assert(
    Array.from({ length: 300 }, (_, i) => getCachedOpenAiCompatibleDefaultModel(`http://concurrent-${i}:8000/v1`)).every((model) => model === 'chat-model'),
    'Expected every endpoint of a burst beyond the bound to remain readable while fresh',
  )
  assert(__test.openAiCompatibleCacheEntryCount() === 300, `Expected fresh entries to be kept beyond the bound, got ${__test.openAiCompatibleCacheEntryCount()}`)
  __test.ageOpenAiCompatibleCache(61_000)
  await resolveOpenAiCompatibleDefaultModel({ baseUrl: 'http://after-grace:8000/v1' })
  assert(__test.openAiCompatibleCacheEntryCount() === 256, `Expected the bound to apply once the grace window lapsed, got ${__test.openAiCompatibleCacheEntryCount()}`)
  // The grace window is not a loophole: beyond four times the bound the oldest go regardless of age.
  clearModelCache()
  await Promise.all(Array.from({ length: 1100 }, (_, i) => resolveOpenAiCompatibleDefaultModel({ baseUrl: `http://flood-${i}:8000/v1` })))
  assert(__test.openAiCompatibleCacheEntryCount() === 1024, `Expected a hard cap of 1024 fresh entries, got ${__test.openAiCompatibleCacheEntryCount()}`)
  clearModelCache()
})

test('identical lookups coalesce even during a burst of distinct endpoints, and the map drains', async () => {
  clearModelCache()
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => { release = resolve })
  let requests = 0
  global.fetch = (async () => {
    requests++
    await gate
    return { ok: true, status: 200, json: async () => ({ data: [{ id: 'chat-model' }] }) } as any
  }) as any
  const lookups = Array.from({ length: 40 }, (_, i) => resolveOpenAiCompatibleDefaultModel({ baseUrl: `http://burst-${i}:8000/v1` }))
  lookups.push(resolveOpenAiCompatibleDefaultModel({ baseUrl: 'http://burst-39:8000/v1' }))
  lookups.push(resolveOpenAiCompatibleDefaultModel({ baseUrl: 'http://burst-39:8000/v1/' }))
  assert(requests === 40, `Expected one request per distinct endpoint during the burst, got ${requests}`)
  assert(__test.inFlightOpenAiCompatibleFetchCount() === 40, 'Expected one in-flight entry per distinct endpoint')
  release()
  const resolved = await Promise.all(lookups)
  assert(resolved.every((model) => model === 'chat-model'), 'Expected every caller in the burst to get its answer')
  assert(__test.inFlightOpenAiCompatibleFetchCount() === 0, 'Expected the in-flight map to drain after the burst')
  clearModelCache()
})

test('discovery refuses query-bearing endpoints without sending a credential', async () => {
  clearModelCache()
  let requests = 0
  global.fetch = (async () => { requests++; throw new Error('must not send') }) as any
  for (const baseUrl of ['http://gateway:8000/v1?tenant=a', 'http://gateway:8000/v1?tenant=a/']) {
    let rejected = false
    try { await resolveOpenAiCompatibleDefaultModel({ baseUrl, apiKey: 'synthetic-tenant-key' }) }
    catch (error) { rejected = error instanceof ModelEndpointPolicyError }
    assert(rejected, 'Query-bearing model endpoints must retain the host policy refusal')
  }
  assert(requests === 0, 'Rejected URLs must not reach fetch')
})

test('a refresh asked for while a lookup is in flight is not undone by that lookup', async () => {
  clearModelCache()
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => { release = resolve })
  let calls = 0
  global.fetch = (async () => {
    calls++
    if (calls === 1) await gate
    return { ok: true, status: 200, json: async () => ({ data: [{ id: calls === 1 ? 'stale-model' : 'fresh-model' }] }) } as any
  }) as any
  const stale = resolveOpenAiCompatibleDefaultModel({ baseUrl: 'http://refresh-endpoint:8000/v1' })
  clearModelCache()
  const fresh = resolveOpenAiCompatibleDefaultModel({ baseUrl: 'http://refresh-endpoint:8000/v1' })
  release()
  await Promise.all([stale, fresh])
  assert(calls === 2, `Expected the refresh to issue its own /models request, got ${calls}`)
  assert(getCachedOpenAiCompatibleDefaultModel('http://refresh-endpoint:8000/v1') === 'fresh-model', 'Expected the post-refresh answer to be the one cached')
  clearModelCache()
})

test('a lookup finishing after a refresh does not evict the replacement lookup', async () => {
  clearModelCache()
  const gates: Array<() => void> = []
  let calls = 0
  global.fetch = (async () => {
    calls++
    await new Promise<void>((resolve) => gates.push(resolve))
    return { ok: true, status: 200, json: async () => ({ data: [{ id: `model-${calls}` }] }) } as any
  }) as any
  const stale = resolveOpenAiCompatibleDefaultModel({ baseUrl: 'http://evict-endpoint:8000/v1' })
  clearModelCache()
  const fresh = resolveOpenAiCompatibleDefaultModel({ baseUrl: 'http://evict-endpoint:8000/v1' })
  gates[0]()
  await stale
  assert(__test.inFlightOpenAiCompatibleFetchCount() === 1, 'Expected the replacement lookup to stay registered after the stale one finished')
  const joined = resolveOpenAiCompatibleDefaultModel({ baseUrl: 'http://evict-endpoint:8000/v1' })
  assert(calls === 2, `Expected a third caller to join the replacement lookup, got ${calls} requests`)
  gates[1]()
  await Promise.all([fresh, joined])
  assert(__test.inFlightOpenAiCompatibleFetchCount() === 0, 'Expected the map to drain once the replacement finished')
  clearModelCache()
})

test('discovery remembers the context length each model advertises', async () => {
  clearModelCache()
  global.fetch = (async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: [
      { id: 'deepseek-ai/DeepSeek-V4-Flash-0731', max_model_len: 131072 },
      { id: 'lmstudio-model', context_length: '32768' },
      { id: 'no-length-model' },
    ] }),
  }) as any) as any
  await resolveOpenAiCompatibleDefaultModel({ baseUrl: 'http://172.16.1.70:8000/v1', apiKey: 'k' })
  assert(getCachedOpenAiCompatibleContextWindow('http://172.16.1.70:8000/v1/', 'k', 'openai-compatible/deepseek-ai/DeepSeek-V4-Flash-0731') === 131072, 'Expected the vLLM max_model_len, through the same credential, with or without the provider prefix')
  assert(getCachedOpenAiCompatibleContextWindow('http://172.16.1.70:8000/v1', 'k', 'lmstudio/lmstudio-model') === 32768, 'Expected a string context_length to be read as a number')
  assert(getCachedOpenAiCompatibleContextWindow('http://172.16.1.70:8000/v1', 'k', 'no-length-model') === undefined, 'Expected no length when the endpoint reports none')
  assert(getCachedOpenAiCompatibleContextWindow('http://172.16.1.70:8000/v1', 'other', 'deepseek-ai/DeepSeek-V4-Flash-0731') === undefined, 'Expected another credential to see no catalog')
  clearModelCache()
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

test('the normal picker and default list drop dated snapshots the installed OpenClaw runtime cannot run', async () => {
  clearModelCache()
  // The OpenAI ids OpenClaw 2026.9.7 ships; it resolves `gpt-5.4-mini` but not its dated snapshot.
  setOpenClawModelCatalogForTests({ version: '2026.9.7', providers: new Map([['openai', new Set(['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano'])]]) })
  global.fetch = (async () => ({ ok: true, status: 200, json: async () => ({ data: [
    { id: 'chatgpt-image-latest' }, { id: 'gpt-image-1' }, { id: 'gpt-5.4-mini-2026-03-17' }, { id: 'gpt-5.4-mini' }, { id: 'gpt-5.5' }, { id: 'gpt-4o-mini' },
  ] }) })) as any
  try {
    const picker = await discoverModels({ openai: 'runtime-catalog-fixture' })
    // `gpt-4o-mini` is not in the catalog either, but nothing shows OpenClaw rejects it, so it stays.
    assert(JSON.stringify(picker.modelsByProvider.openai.models) === JSON.stringify(['openai/gpt-4o-mini', 'openai/gpt-5.4-mini', 'openai/gpt-5.5']), `Normal picker must drop only the unrunnable snapshot: ${picker.modelsByProvider.openai.models.join(', ')}`)
    assert(JSON.stringify(picker.models) === JSON.stringify(picker.modelsByProvider.openai.models), 'The flat list must match the grouped list')
    const advanced = await discoverModels({ openai: 'runtime-catalog-fixture' }, { showAll: true })
    assert(advanced.modelsByProvider.openai.models.includes('openai/gpt-5.4-mini-2026-03-17'), 'Show all models still lists every provider id')
    assert(!advanced.models.some(model => /chatgpt-image|gpt-image/.test(model)), 'Advanced cached lists must also exclude image-only models')
    const defaults = getAvailableModelsCached({ SYSTEM_OPENAI_API_KEY: 'runtime-catalog-fixture' })
    assert(!defaults.includes('openai/gpt-5.4-mini-2026-03-17') && defaults.includes('openai/gpt-5.4-mini'), `Defaults must come from runnable models: ${defaults.join(', ')}`)
  } finally {
    setOpenClawModelCatalogForTests(null)
    clearModelCache()
  }
})

testChain.then(() => {
  global.fetch = originalFetch
  if (originalKind === undefined) delete process.env.DASHBOARD_DEPLOYMENT_KIND
  else process.env.DASHBOARD_DEPLOYMENT_KIND = originalKind
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
