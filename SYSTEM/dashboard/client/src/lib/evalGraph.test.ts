import assert from 'assert'
import { getEvalAttributes, getEvalJudge, getEvalTrialCount } from './evalGraph'
import type { EvalRecord } from './plugins'

function makeEval(overrides: Partial<EvalRecord> = {}): EvalRecord {
  return {
    id: 'eval-1',
    kind: 'eval',
    name: 'Workflow correctness and speed',
    description: 'Check safe results within the cost budget.',
    tags: ['workflow', 'correctness', 'speed', 'cost', 'safety'],
    enabled: true,
    createdAt: '',
    updatedAt: '',
    target: { type: 'workflow', ids: [] },
    experiment: {
      input: 'Run the workflow.',
      candidateOutput: '',
      expectedOutput: 'A correct and source-grounded answer.',
      judge: 'fixed',
    },
    runs: [],
    ...overrides,
  }
}

assert.deepEqual(
  getEvalAttributes(makeEval()),
  ['Correctness', 'Quality', 'Speed', 'Cost'],
  'Eval graph attributes must be deterministic and bounded',
)
assert.deepEqual(
  getEvalAttributes(makeEval({
    name: 'Unclassified experiment',
    description: '',
    tags: [],
    experiment: { input: '', candidateOutput: '', expectedOutput: '', judge: 'fixed' },
  })),
  ['Expected outcome'],
  'Unclassified evals must retain an understandable attribute node',
)
assert.equal(getEvalTrialCount(makeEval()), 1, 'Legacy evals without iteration metadata must show one planned trial')
assert.equal(
  getEvalTrialCount(makeEval({
    experiment: {
      input: '',
      candidateOutput: '',
      expectedOutput: '',
      judge: 'fixed',
      iterations: 15,
    } as EvalRecord['experiment'],
  })),
  15,
  'Configured Eval iterations must drive the planned trial count',
)
assert.equal(getEvalJudge(makeEval()).label, 'Fixed evaluator', 'Fixed judges must have a clear evaluator label')
assert.equal(
  getEvalJudge(makeEval({
    experiment: { input: '', candidateOutput: '', expectedOutput: '', judge: 'ai' },
  })).label,
  'AI evaluator',
  'AI judges must have a clear evaluator label',
)
assert.equal(
  getEvalJudge(makeEval({
    experiment: {
      input: '',
      candidateOutput: '',
      expectedOutput: '',
      judge: 'human',
    } as EvalRecord['experiment'],
  })).label,
  'Human evaluator',
  'Future human judges must render without being mislabeled as fixed',
)

console.log('evalGraph.test.ts: 7 tests passed')
