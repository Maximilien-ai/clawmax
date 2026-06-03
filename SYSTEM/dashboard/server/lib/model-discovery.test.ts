import { __test, clearModelCache, discoverModels } from './model-discovery'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0
const originalFetch = global.fetch

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

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

console.log(`\n${YELLOW}=== Model Discovery Test Suite ===${RESET}\n`)

test('OpenAI discovery hides unsupported future models by default', () => {
  const filtered = __test.filterCompatibleDiscoveredModels('openai', [
    'openai/gpt-5',
    'openai/gpt-5.4-mini',
    'openai/gpt-4.1',
    'openai/gpt-4o-mini',
  ])
  assert(filtered.includes('openai/gpt-5'), 'Expected gpt-5 to remain visible')
  assert(filtered.includes('openai/gpt-4.1'), 'Expected gpt-4.1 to remain visible')
  assert(!filtered.includes('openai/gpt-5.4-mini'), 'Expected unsupported gpt-5.4-mini to be hidden')
})

test('Show-all mode preserves provider models without compatibility filtering', () => {
  const filtered = __test.filterCompatibleDiscoveredModels('openai', [
    'openai/gpt-5',
    'openai/gpt-5.4-mini',
  ], true)
  assert(filtered.includes('openai/gpt-5'), 'Expected gpt-5 to remain visible')
  assert(filtered.includes('openai/gpt-5.4-mini'), 'Expected show-all mode to preserve unsupported-looking models')
})

test('Ollama models are never compatibility filtered', () => {
  const filtered = __test.filterCompatibleDiscoveredModels('ollama', [
    'ollama/qwen2.5:latest',
    'ollama/llama3.2:latest',
  ])
  assert(filtered.length === 2, `Expected both Ollama models, got ${filtered.length}`)
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

test('discoverModels loads LM Studio models from an OpenAI-compatible endpoint', async () => {
  clearModelCache()
  global.fetch = (async (url: string) => {
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

test('discoverModels loads Ollama models from the local tags endpoint', async () => {
  clearModelCache()
  global.fetch = (async (url: string) => {
    assert(url === 'http://127.0.0.1:11434/api/tags', `Expected Ollama tags endpoint, got ${url}`)
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

console.log(`\nTests passed: ${testsPassed}`)
console.log(`Tests failed: ${testsFailed}`)

global.fetch = originalFetch

if (testsFailed > 0) {
  console.log(`\n${RED}Some tests failed${RESET}`)
  process.exit(1)
} else {
  console.log(`\n${GREEN}All tests passed${RESET}`)
}
