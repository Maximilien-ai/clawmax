import assert from 'node:assert/strict'
import { resolveByokOpenRequest } from './byokOpenRequest'

assert.deepEqual(resolveByokOpenRequest(undefined, 'models'), {
  step: 'models', provider: null, aboveAiEditor: false,
})
assert.deepEqual(resolveByokOpenRequest({ step: 'models', provider: 'anthropic', fromAiEditor: true }, 'partners'), {
  step: 'models', provider: 'anthropic', aboveAiEditor: true,
})
assert.deepEqual(resolveByokOpenRequest({ provider: 'unexpected', fromAiEditor: false }, 'partners'), {
  step: 'partners', provider: null, aboveAiEditor: false,
})
console.log('BYOK open request tests passed')
