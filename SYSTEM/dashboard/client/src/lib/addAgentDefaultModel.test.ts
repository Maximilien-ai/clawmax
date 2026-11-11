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

test('keeps current model when AI suggests a different available model', () => {
  const resolved = resolveAddAgentWizardSuggestedModel({
    models: ['openai/gpt-4o-mini', 'openai/gpt-5'],
    currentModel: 'openai/gpt-5',
    suggestedModel: 'openai/gpt-4o-mini',
  })
  assert.equal(resolved, 'openai/gpt-5')
})

test('accepts AI suggested model when no current model is selected', () => {
  const resolved = resolveAddAgentWizardSuggestedModel({
    models: ['openai/gpt-4o-mini', 'ollama/qwen2.5:latest'],
    currentModel: '',
    suggestedModel: 'openai/gpt-4o-mini',
  })
  assert.equal(resolved, 'openai/gpt-4o-mini')
})

test('swaps retired preferred OpenAI models for active replacements when available', () => {
  const resolved = resolveAddAgentWizardDefaultModel({
    models: ['openai/gpt-5.5', 'openai/gpt-4'],
    byok: { preferredModel: 'openai/gpt-4' },
    config: {},
  })
  assert.equal(resolved, 'openai/gpt-5.5')
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

test('preserves the saved default when discovery omits it and AI suggests an available model', () => {
  const models = ['openai/o3-2025-04-16']
  const selected = resolveAddAgentWizardDefaultModel({ models, byok: { preferredModel: 'openai/gpt-5.4-mini' } })
  assert.equal(selected, 'openai/gpt-5.4-mini')
  assert.equal(resolveAddAgentWizardSuggestedModel({ models, currentModel: selected, suggestedModel: models[0] }), selected)
})
test('system-only default does not override the new-agent workspace default', () => {
  assert.equal(resolveAddAgentWizardDefaultModel({ models: ['openai/gpt-5.4'],
    byok: { systemPreferredModel: 'openai/gpt-5.4' }, config: { preferredModel: 'openai/gpt-5.4-mini' } }), 'openai/gpt-5.4-mini')
})

// Auto with a key kept only in this browser: the server sends no recommendation, and OpenAI discovery
// lists models sorted by id, so deprecated gpt-4.1 comes first.
const OPENAI_SORTED = ['openai/gpt-4.1', 'openai/gpt-4.1-mini', 'openai/gpt-4o', 'openai/gpt-4o-mini', 'openai/gpt-5', 'openai/gpt-5.4-mini', 'openai/gpt-5.5']
test('Auto picks gpt-5.4-mini over deprecated gpt-4.1 listed ahead of it', () => {
  assert.equal(resolveAddAgentWizardDefaultModel({ models: OPENAI_SORTED, config: {}, byok: {} }), 'openai/gpt-5.4-mini')
})
test('Auto without gpt-5.4-mini access picks the first current model, never a deprecated one', () => {
  assert.equal(resolveAddAgentWizardDefaultModel({ models: OPENAI_SORTED.filter((m) => m !== 'openai/gpt-5.4-mini'), config: {} }), 'openai/gpt-5')
})
test('Auto with only current models keeps the first offered model', () => {
  assert.equal(resolveAddAgentWizardDefaultModel({ models: ['openai/gpt-5', 'openai/gpt-5.5'], config: {} }), 'openai/gpt-5')
})
test('an explicitly saved deprecated gpt-4.1 stays selected, from this browser or the server', () => {
  assert.equal(resolveAddAgentWizardDefaultModel({ models: OPENAI_SORTED, byok: { preferredModel: 'openai/gpt-4.1' } }), 'openai/gpt-4.1')
  assert.equal(resolveAddAgentWizardDefaultModel({ models: OPENAI_SORTED, config: { preferredModel: 'openai/gpt-4.1' } }), 'openai/gpt-4.1')
})
test('Auto picks nothing while discovery has failed, then gpt-5.4-mini once the list loads', () => {
  assert.equal(resolveAddAgentWizardDefaultModel({ models: [], config: {} }), '')
  assert.equal(resolveAddAgentWizardDefaultModel({ models: OPENAI_SORTED, config: {} }), 'openai/gpt-5.4-mini')
})
test('Auto across several providers prefers gpt-5.4-mini when offered and otherwise a current model', () => {
  const anthropic = ['anthropic/claude-sonnet-4-20250514', 'anthropic/claude-sonnet-4-6']
  assert.equal(resolveAddAgentWizardDefaultModel({ models: [...anthropic, ...OPENAI_SORTED], config: {} }), 'openai/gpt-5.4-mini')
  assert.equal(resolveAddAgentWizardDefaultModel({ models: [...anthropic, 'openai/gpt-4.1'], config: {} }), 'anthropic/claude-sonnet-4-6')
})
test('Auto with only deprecated models offered resolves to no model, so the wizard asks for one', () => {
  assert.equal(resolveAddAgentWizardDefaultModel({ models: ['openai/gpt-4.1', 'openai/gpt-4.1-mini', 'openai/gpt-4o'], config: {} }), '')
})
test('a server recommendation still wins over the Auto fallback', () => {
  assert.equal(resolveAddAgentWizardDefaultModel({ models: OPENAI_SORTED, config: { recommendedModel: 'openai/gpt-5.5' } }), 'openai/gpt-5.5')
})
console.log('addAgentDefaultModel.test.ts: 21 tests passed')
