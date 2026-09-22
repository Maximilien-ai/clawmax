import assert from 'node:assert/strict'
import { agentAttentionFromReadiness as attention, agentAttentionKey } from './agentReadiness'

assert.equal(attention({ available: true, resolvedAgent: { model: 'inherited/model' } }), null)
assert.equal(attention({ available: true, resolvedAgent: { provider: 'openai' } }), null, 'usable shared credentials must not warn')
assert.equal(attention({ available: true, resolvedAgent: { provider: 'ollama' } }), null, 'local models do not require hosted keys')
assert.equal(attention({ available: true, resolvedAgent: { provider: 'openai', runtime: 'codex' } }, true), null, 'CLI-owned authentication must not require browser key verification')
assert.equal(attention({ available: false, error: 'Agent x has no model configured.' })?.kind, 'model')
for (const provider of ['openai', 'anthropic', 'gemini', 'openrouter', 'xai']) {
  const result = attention({ available: false, error: `no ${provider} credential is available`, resolvedAgent: { provider } })!
  assert.equal(result.kind, 'credentials')
  assert.equal(result.provider, provider)
  assert.match(result.message, /browser profile/)
  assert.equal(attention({ available: true, resolvedAgent: { provider } }, true)?.action, 'Verify credentials')
  assert.equal(attention({ available: true, resolvedAgent: { provider } }, false), null, 'successful validation clears warning')
}
assert.equal(attention(null)?.kind, 'unknown')
assert.equal(attention({ error: 'network down' })?.kind, 'unknown')
assert.equal(attention({ available: false, code: 'template_runtime_unavailable' })?.kind, 'runtime')
assert.equal(attention({ available: false, error: 'no Ollama runtime is configured' })?.kind, 'runtime')
assert.equal(attention({ available: false, error: 'secret sk-do-not-expose', resolvedAgent: { provider: '__proto__' } })?.message.includes('sk-do-not-expose'), false)
assert.notEqual(agentAttentionKey('a', 'old'), agentAttentionKey('a', 'new'))
console.log('Agent readiness warning tests passed')
