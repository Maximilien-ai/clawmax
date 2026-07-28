import assert from 'assert'
import { recommendModelsForDescription } from './model-fit'

const tests: Array<{ name: string; run: () => void }> = []
function test(name: string, run: () => void) {
  tests.push({ name, run })
}

test('ranks only compatible models reported as available', () => {
  const result = recommendModelsForDescription({
    description: 'Analyze a complex product strategy and explain the reasoning.',
    availableModels: ['openai/gpt-5.4-mini', 'openai/o3'],
  })
  assert.equal(result.recommendedModel, 'openai/gpt-5.4-mini')
  assert.deepEqual(result.candidates.map(candidate => candidate.model), ['openai/gpt-5.4-mini'])
  assert.equal(result.excludedModels[0]?.model, 'openai/o3')
  assert.match(result.excludedModels[0]?.reason || '', /web search/i)
})

test('prefers an explicit coding model for repository work', () => {
  const result = recommendModelsForDescription({
    description: 'Review a TypeScript repository, debug failures, and write code changes.',
    availableModels: ['openai/gpt-5.4-mini', 'openai/gpt-5.3-codex', 'google/gemini-2.5-flash'],
  })
  assert.equal(result.recommendedModel, 'openai/gpt-5.3-codex')
  assert(result.requirements.coding)
  assert(result.candidates[0].reasons.some(reason => /coding specialization/i.test(reason)))
})

test('prefers a local model when privacy is explicit', () => {
  const result = recommendModelsForDescription({
    description: 'Summarize confidential HR documents using an offline private local model.',
    availableModels: ['anthropic/claude-sonnet-4-20250514', 'ollama/qwen3:8b'],
  })
  assert.equal(result.recommendedModel, 'ollama/qwen3:8b')
  assert(result.requirements.privacy)
})

test('cost preference favors efficiency variants', () => {
  const result = recommendModelsForDescription({
    description: 'Classify a high volume of support messages into structured fields.',
    availableModels: ['openai/gpt-5.4-pro', 'openai/gpt-5.4-mini'],
    preference: 'cost',
  })
  assert.equal(result.recommendedModel, 'openai/gpt-5.4-mini')
})

test('reports capability uncertainty instead of asserting unsupported facts', () => {
  const result = recommendModelsForDescription({
    description: 'Inspect screenshots and a very large document, then return JSON.',
    availableModels: ['openrouter/auto'],
  })
  assert.equal(result.confidence, 'low')
  assert(result.requirements.vision)
  assert(result.requirements.longContext)
  assert(result.candidates[0].caveats.some(caveat => /Vision support cannot be confirmed/i.test(caveat)))
  assert(result.disclaimer.includes('not a quality or cost measurement'))
})

test('returns an explicit empty recommendation when no model is available', () => {
  const result = recommendModelsForDescription({
    description: 'Draft a weekly summary.',
    availableModels: [],
  })
  assert.equal(result.recommendedModel, null)
  assert.equal(result.candidates.length, 0)
  assert.match(result.summary, /No runtime-visible models/)
})

test('does not auto-select OpenAI reasoning aliases that reject the runtime web-search tool', () => {
  const result = recommendModelsForDescription({
    description: 'Research current information with tools and explain the result.',
    availableModels: ['openai/o1', 'openai/o3-mini'],
    preference: 'quality',
  })
  assert.equal(result.recommendedModel, null)
  assert.deepEqual(result.excludedModels.map(entry => entry.model), ['openai/o1', 'openai/o3-mini'])
  assert.match(result.summary, /No known tool-compatible/)
})

let passed = 0
for (const entry of tests) {
  try {
    entry.run()
    console.log(`✓ ${entry.name}`)
    passed += 1
  } catch (error) {
    console.error(`✗ ${entry.name}`)
    throw error
  }
}

console.log(`Tests passed: ${passed}`)
