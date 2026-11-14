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
test('BOM, export syntax, CRLF and quoted multiline/hash values retain their intended bytes', () => {
  assert.deepEqual(providerKeys('\uFEFFexport SYSTEM_OPENAI_API_KEY="synthetic#literal"\r\nSYSTEM_ANTHROPIC_API_KEY="line-one\\nline-two"\r\nSYSTEM_GEMINI_API_KEY=`synthetic-backtick`\r\n'), {
    openai: 'synthetic#literal', anthropic: 'line-one\nline-two', gemini: 'synthetic-backtick',
  })
})
test('user/standard credentials are excluded and interpolation remains literal', () => {
  assert.deepEqual(providerKeys('USER_OPENAI_API_KEY=synthetic-user\nOPENAI_API_KEY=synthetic-standard\n', {
    USER_OPENAI_API_KEY: 'synthetic-runtime-user', OPENAI_API_KEY: 'synthetic-runtime-standard',
  }), {})
  assert.deepEqual(providerKeys('SYSTEM_OPENAI_API_KEY=${UNTRUSTED_VALUE}\n'), { openai: '${UNTRUSTED_VALUE}' })
})
test('parsing never populates process.env or mutates the caller environment', () => {
  const name = 'CLAWMAX_DOTENV_PARSE_SENTINEL'
  const previous = process.env[name]
  const runtime = Object.freeze({ SYSTEM_OPENAI_API_KEY: 'synthetic-runtime' })
  assert.deepEqual(providerKeys(`${name}=from-file\nSYSTEM_OPENAI_API_KEY=synthetic-file`, runtime), { openai: 'synthetic-runtime' })
  assert.equal(process.env[name], previous)
  assert.deepEqual(runtime, { SYSTEM_OPENAI_API_KEY: 'synthetic-runtime' })
})
