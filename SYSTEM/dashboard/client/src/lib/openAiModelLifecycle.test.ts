import assert from 'assert'
import {
  formatOpenAiDeprecationNotice,
  formatOpenAiModelLabel,
  getOpenAiModelDeprecation,
  getOpenAiModelReplacement,
  isSelectableLifecycleModel,
  resolveNonDeprecatedOpenAiModel,
} from './openAiModelLifecycle'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error: any) {
    console.error(`✗ ${name}`)
    throw error
  }
}

test('detects known deprecated OpenAI snapshot models', () => {
  const info = getOpenAiModelDeprecation('openai/gpt-4.1')
  assert(info, 'Expected deprecated model info')
  assert.equal(info?.replacementModel, 'gpt-5.5')
})

test('builds provider-aware replacement models', () => {
  assert.equal(getOpenAiModelReplacement('openai/gpt-4'), 'openai/gpt-5.5')
  assert.equal(getOpenAiModelReplacement('openai/gpt-3.5-turbo'), 'openai/gpt-5.4-mini')
  assert.equal(getOpenAiModelReplacement('openai-compatible/gpt-5-mini-2025-08-07'), null)
})

test('resolves deprecated snapshots to replacements when available', () => {
  const resolved = resolveNonDeprecatedOpenAiModel(
    ['openai/gpt-5.5', 'openai/gpt-4'],
    'openai/gpt-4'
  )
  assert.equal(resolved, 'openai/gpt-5.5')
})

test('does not keep a retired selection when no active replacement is available', () => {
  const resolved = resolveNonDeprecatedOpenAiModel(
    ['openai/gpt-4'],
    'openai/gpt-4'
  )
  assert.equal(resolved, '')
})

test('formats option labels and notices for deprecated snapshots', () => {
  assert.equal(formatOpenAiModelLabel('openai/gpt-4.1'), 'openai/gpt-4.1 [deprecated → gpt-5.5]')
  assert(formatOpenAiDeprecationNotice('openai/gpt-4.1')?.includes('2027-01-14'))
})

test('detects anthropic and gemini lifecycle entries', () => {
  assert(formatOpenAiDeprecationNotice('anthropic/claude-3-7-sonnet-20250219')?.includes('Anthropic'))
  assert(formatOpenAiDeprecationNotice('google/gemini-2.5-flash')?.includes('Gemini'))
})

test('filters deprecated models with replacements from selection lists', () => {
  assert.equal(isSelectableLifecycleModel('anthropic/claude-3-7-sonnet-20250219'), false)
  assert.equal(isSelectableLifecycleModel('google/gemini-2.5-flash'), false)
  assert.equal(isSelectableLifecycleModel('google/gemini-2.5-flash-preview-tts'), true)
})

test('does not apply first-party lifecycle filtering to openai-compatible models', () => {
  assert.equal(isSelectableLifecycleModel('openai-compatible/gpt-5-2025-08-07'), true)
  assert.equal(resolveNonDeprecatedOpenAiModel(['openai-compatible/gpt-5-2025-08-07'], 'openai-compatible/gpt-5-2025-08-07'), 'openai-compatible/gpt-5-2025-08-07')
})

test('keeps current deprecated selections visible in pickers', () => {
  assert.equal(isSelectableLifecycleModel('anthropic/claude-3-7-sonnet-20250219', 'anthropic/claude-3-7-sonnet-20250219'), true)
  assert.equal(isSelectableLifecycleModel('openai/gpt-4', 'openai/gpt-4'), true)
  assert.equal(isSelectableLifecycleModel('openai/gpt-4.1'), false)
  assert.equal(resolveNonDeprecatedOpenAiModel(['openai/gpt-5.5', 'openai/gpt-4.1'], 'openai/gpt-4.1'), 'openai/gpt-4.1')
})

console.log('openAiModelLifecycle.test.ts: 9 tests passed')
