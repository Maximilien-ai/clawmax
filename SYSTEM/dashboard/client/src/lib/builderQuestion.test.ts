import assert from 'assert'
import { parseBuilderQuestionCommand } from './builderQuestion'

assert.strictEqual(parseBuilderQuestionCommand('/question Which option is cheaper?'), 'Which option is cheaper?')
assert.strictEqual(parseBuilderQuestionCommand('  /QUESTION   Explain the tradeoff  '), 'Explain the tradeoff')
assert.strictEqual(parseBuilderQuestionCommand('/question'), null)
assert.strictEqual(parseBuilderQuestionCommand('Create a support workflow'), null)

console.log('builderQuestion.test.ts: ok (4 tests)')
