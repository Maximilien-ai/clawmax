import assert from 'assert'
import { resolveAddAgentWizardDefaultModel, resolveAddAgentWizardSuggestedModel } from './addAgentDefaultModel'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error: any) {
    console.error(`✗ ${name}`)
    throw error
  }
}

test('prefers browser preferred model when available', () => {
  const resolved = resolveAddAgentWizardDefaultModel({
    models: ['ollama/qwen2.5:latest', 'openai/gpt-5'],
    byok: { preferredModel: 'ollama/qwen2.5:latest' },
    config: { recommendedModel: 'openai/gpt-5', ollamaEnabled: true, defaultOllamaBaseUrl: 'http://127.0.0.1:11434' },
  })
  assert.equal(resolved, 'ollama/qwen2.5:latest')
})

test('prefers configured local runtime over hosted recommended model', () => {
  const resolved = resolveAddAgentWizardDefaultModel({
    models: ['ollama/qwen2.5:latest', 'openai/gpt-5'],
    byok: { ollamaBaseUrl: 'http://127.0.0.1:11434' },
    config: { recommendedModel: 'openai/gpt-5', ollamaEnabled: true, defaultOllamaBaseUrl: 'http://127.0.0.1:11434' },
  })
  assert.equal(resolved, 'ollama/qwen2.5:latest')
})

test('uses openai-compatible default model before hosted recommendation', () => {
  const resolved = resolveAddAgentWizardDefaultModel({
    models: ['openai-compatible/meta-llama-3.1-8b-instruct', 'openai/gpt-5'],
    byok: { openaiCompatibleDefaultModel: 'meta-llama-3.1-8b-instruct', openaiCompatibleBaseUrl: 'http://127.0.0.1:1234/v1' },
    config: { recommendedModel: 'openai/gpt-5' },
  })
  assert.equal(resolved, 'openai-compatible/meta-llama-3.1-8b-instruct')
})

test('falls back to recommended hosted model when no local runtime is configured', () => {
  const resolved = resolveAddAgentWizardDefaultModel({
    models: ['openai/gpt-5', 'anthropic/claude-sonnet-4-20250514'],
    config: { recommendedModel: 'openai/gpt-5' },
  })
  assert.equal(resolved, 'openai/gpt-5')
})

test('falls back to first available model when no preferences exist', () => {
  const resolved = resolveAddAgentWizardDefaultModel({
    models: ['meta-llama-3.1-8b-instruct', 'openai/gpt-5'],
    config: {},
  })
  assert.equal(resolved, 'meta-llama-3.1-8b-instruct')
})

test('keeps current model when AI suggests an unavailable hosted model', () => {
  const resolved = resolveAddAgentWizardSuggestedModel({
    models: ['ollama/qwen2.5:latest'],
    currentModel: 'ollama/qwen2.5:latest',
    suggestedModel: 'openai/gpt-4o-mini',
  })
  assert.equal(resolved, 'ollama/qwen2.5:latest')
})

test('accepts AI suggested model when it is available', () => {
  const resolved = resolveAddAgentWizardSuggestedModel({
    models: ['openai/gpt-4o-mini', 'ollama/qwen2.5:latest'],
    currentModel: 'ollama/qwen2.5:latest',
    suggestedModel: 'openai/gpt-4o-mini',
  })
  assert.equal(resolved, 'openai/gpt-4o-mini')
})

test('swaps deprecated preferred OpenAI snapshots for replacement models when available', () => {
  const resolved = resolveAddAgentWizardDefaultModel({
    models: ['openai/gpt-5', 'openai/gpt-5-2025-08-07'],
    byok: { preferredModel: 'openai/gpt-5-2025-08-07' },
    config: {},
  })
  assert.equal(resolved, 'openai/gpt-5')
})

test('swaps deprecated Anthropic snapshots for replacement models when available', () => {
  const resolved = resolveAddAgentWizardDefaultModel({
    models: ['anthropic/claude-sonnet-4-6', 'anthropic/claude-3-7-sonnet-20250219'],
    byok: { preferredModel: 'anthropic/claude-3-7-sonnet-20250219' },
    config: {},
  })
  assert.equal(resolved, 'anthropic/claude-sonnet-4-6')
})

test('does not rewrite openai-compatible models that only look like OpenAI snapshots', () => {
  const resolved = resolveAddAgentWizardDefaultModel({
    models: ['openai-compatible/gpt-5-2025-08-07'],
    byok: { preferredModel: 'openai-compatible/gpt-5-2025-08-07' },
    config: {},
  })
  assert.equal(resolved, 'openai-compatible/gpt-5-2025-08-07')
})

console.log('addAgentDefaultModel.test.ts: 10 tests passed')
