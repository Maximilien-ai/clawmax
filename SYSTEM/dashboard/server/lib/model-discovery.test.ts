import { __test } from './model-discovery'

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

console.log(`\nTests passed: ${testsPassed}`)
console.log(`Tests failed: ${testsFailed}`)

if (testsFailed > 0) {
  console.log(`\n${RED}Some tests failed${RESET}`)
  process.exit(1)
} else {
  console.log(`\n${GREEN}All tests passed${RESET}`)
}
