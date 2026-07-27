import assert from 'assert'
import { buildAgentModelFitDescription } from './modelFit'

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

console.log('modelFit.test.ts: 3 tests passed')
