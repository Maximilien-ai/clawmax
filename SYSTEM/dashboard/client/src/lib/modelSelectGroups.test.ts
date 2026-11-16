import assert from 'node:assert/strict'
import { groupActiveModelOptions } from './modelSelectGroups'
import { isSelectableLifecycleModel } from './openAiModelLifecycle'

const groups = groupActiveModelOptions({
  openai: { models: ['openai/gpt-5.5', 'openai/gpt-4.1', 'openai/gpt-4', 'openai/gpt-5.5'] },
  anthropic: { models: ['anthropic/claude-sonnet-4-6', 'anthropic/claude-sonnet-4-20250514'] },
  gemini: { models: ['google/gemma-4-31b-it', 'google/gemini-2.5-flash'] },
  ollama: { models: ['ollama/local-model'] },
  'openai-compatible': { models: ['openai-compatible/gpt-4'] },
})
assert.deepEqual(groups.map(group => group.label), ['OpenAI', 'Anthropic', 'Gemini', 'Local models'])
assert.deepEqual(groups[0].options.map(option => option.value), ['openai/gpt-5.5'])
assert.equal(groups[1].options.length, 1)
assert.equal(groups[2].options.length, 1)
assert.equal(groups[3].options.length, 2)
assert.deepEqual(groupActiveModelOptions({}), [])
assert.equal(isSelectableLifecycleModel('openai/gpt-4.1'), false)
assert.equal(isSelectableLifecycleModel('openai/gpt-4.1', 'openai/gpt-4.1'), true)
assert.equal(isSelectableLifecycleModel('openai/gpt-4', 'openai/gpt-4'), true)
console.log('modelSelectGroups.test.ts: 9 tests passed')
