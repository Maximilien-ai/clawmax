import assert from 'assert'
import {
  formatOpenAiDeprecationNotice,
  formatOpenAiModelLabel,
  getOpenAiModelDeprecation,
  getOpenAiModelReplacement,
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
  const info = getOpenAiModelDeprecation('openai/gpt-5-2025-08-07')
  assert(info, 'Expected deprecated model info')
  assert.equal(info?.replacementModel, 'gpt-5')
})

test('builds provider-aware replacement models', () => {
  assert.equal(getOpenAiModelReplacement('openai/gpt-5-mini-2025-08-07'), 'openai/gpt-5-mini')
  assert.equal(getOpenAiModelReplacement('openai-compatible/gpt-5-mini-2025-08-07'), 'openai-compatible/gpt-5-mini')
})

test('resolves deprecated snapshots to replacements when available', () => {
  const resolved = resolveNonDeprecatedOpenAiModel(
    ['openai/gpt-5', 'openai/gpt-5-2025-08-07'],
    'openai/gpt-5-2025-08-07'
  )
  assert.equal(resolved, 'openai/gpt-5')
})

test('keeps deprecated snapshots when replacement is unavailable', () => {
  const resolved = resolveNonDeprecatedOpenAiModel(
    ['openai/gpt-5-2025-08-07'],
    'openai/gpt-5-2025-08-07'
  )
  assert.equal(resolved, 'openai/gpt-5-2025-08-07')
})

test('formats option labels and notices for deprecated snapshots', () => {
  assert.equal(formatOpenAiModelLabel('openai/gpt-5-2025-08-07'), 'openai/gpt-5-2025-08-07 [deprecated → gpt-5]')
  assert(formatOpenAiDeprecationNotice('openai/gpt-5-2025-08-07')?.includes('2026-12-10'))
})

console.log('openAiModelLifecycle.test.ts: 5 tests passed')
