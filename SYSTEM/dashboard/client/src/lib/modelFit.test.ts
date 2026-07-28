import assert from 'assert'
import {
  buildAgentModelFitDescription,
  MODEL_FIT_AUTO_STORAGE_KEY,
  MODEL_FIT_DETAILS_STORAGE_KEY,
  readModelFitAutoApply,
  readModelFitDetailsExpanded,
  storeModelFitPreference,
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
assert.strictEqual(readModelFitAutoApply(storage), false, 'automatic model application must be opt-in')
storeModelFitPreference(MODEL_FIT_DETAILS_STORAGE_KEY, false, storage)
storeModelFitPreference(MODEL_FIT_AUTO_STORAGE_KEY, true, storage)
assert.strictEqual(readModelFitDetailsExpanded(storage), false, 'detail disclosure should persist across views')
assert.strictEqual(readModelFitAutoApply(storage), true, 'automatic application preference should persist across views')

console.log('modelFit.test.ts: 7 tests passed')
