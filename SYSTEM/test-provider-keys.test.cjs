const assert = require('node:assert/strict')
const { test } = require('node:test')
const { providerKeys } = require('./test-provider-keys.cjs')

test('dotenv quotes, whitespace, and comments do not become credential bytes', () => {
  assert.deepEqual(providerKeys(`SYSTEM_OPENAI_API_KEY="synthetic-openai"
SYSTEM_ANTHROPIC_API_KEY='synthetic-anthropic'
SYSTEM_GEMINI_API_KEY = synthetic-gemini # comment
UNRELATED_SECRET=excluded`), {
    openai: 'synthetic-openai', anthropic: 'synthetic-anthropic', gemini: 'synthetic-gemini',
  })
})
test('environment takes precedence, including explicit empty values', () => {
  assert.deepEqual(providerKeys('SYSTEM_OPENAI_API_KEY=old\nSYSTEM_GEMINI_API_KEY=old', {
    SYSTEM_OPENAI_API_KEY: 'rotated', SYSTEM_GEMINI_API_KEY: '',
  }), { openai: 'rotated' })
})
test('missing credentials produce an empty provider map', () => {
  assert.deepEqual(providerKeys(''), {})
})
