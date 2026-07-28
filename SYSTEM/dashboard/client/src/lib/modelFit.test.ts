import assert from 'assert'
import {
  buildAgentModelFitDescription,
  MODEL_FIT_DETAILS_STORAGE_KEY,
  normalizeAgentModelFitState,
  readModelFitDetailsExpanded,
  storeModelFitPreference,
  syncAgentModelFitIdentity,
} from './modelFit'

const description = buildAgentModelFitDescription({
  identity: '  # Identity\nResearch analyst  ',
  soul: '\n# Soul\nBe precise.\n',
  tools: '# Tools\nUse search.',
})

assert.strictEqual(
  description,
  '# Identity\nResearch analyst\n\n# Soul\nBe precise.\n\n# Tools\nUse search.',
  'Agent instructions must form one stable recommendation description',
)
assert.strictEqual(
  buildAgentModelFitDescription({ identity: '', soul: '  ', tools: '# Tools' }),
  '# Tools',
  'Empty instruction files must be omitted',
)
assert.strictEqual(
  buildAgentModelFitDescription({}),
  '',
  'Missing instructions must produce an empty description',
)

const values = new Map<string, string>()
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
}
assert.strictEqual(readModelFitDetailsExpanded(storage), true, 'suggestion details should start expanded')
storeModelFitPreference(MODEL_FIT_DETAILS_STORAGE_KEY, false, storage)
assert.strictEqual(readModelFitDetailsExpanded(storage), false, 'detail disclosure should persist across views')
assert.deepStrictEqual(
  normalizeAgentModelFitState({ selectionMode: 'auto', preference: 'cost' }),
  { selectionMode: 'auto', preference: 'cost' },
  'agent-specific automatic selection settings must normalize without losing the priority',
)
assert.deepStrictEqual(
  normalizeAgentModelFitState({ selectionMode: 'invalid', preference: 'invalid' }),
  { selectionMode: 'manual', preference: 'balanced' },
  'invalid or missing settings must use conservative defaults',
)
const identity = syncAgentModelFitIdentity(
  '# Identity\n\n- **Model:** openai/gpt-5.5\n\n## Creation Metadata\n\n- **Model:** original/model\n',
  'auto',
  'cost',
)
assert(identity.includes('- **Model Selection:** auto'), 'selection mode must persist in the runtime identity section')
assert(identity.includes('- **Model Priority:** cost'), 'selection priority must persist in the runtime identity section')
assert(identity.indexOf('Model Selection') < identity.indexOf('## Creation Metadata'), 'selection settings must not be stored as creation metadata')
const updatedIdentity = syncAgentModelFitIdentity(identity, 'manual', 'quality')
assert.strictEqual((updatedIdentity.match(/\*\*Model Selection:\*\*/g) || []).length, 1, 'selection mode must update without duplication')
assert(updatedIdentity.includes('- **Model Selection:** manual'), 'selection mode must be replaceable')
assert(updatedIdentity.includes('- **Model Priority:** quality'), 'selection priority must be replaceable')

console.log('modelFit.test.ts: 13 tests passed')
