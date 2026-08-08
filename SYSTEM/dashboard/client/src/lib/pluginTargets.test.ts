import assert from 'assert'
import { formatPluginTargetNames } from './plugins'

const context: any = {
  agents: [{ id: 'agent-a', name: 'Research Agent' }],
  workflows: [{ id: 'workflow-a', name: 'Weekly Report' }],
}

assert.deepEqual(formatPluginTargetNames({ kind: 'guardrail', name: 'Guard', id: 'g', enabled: true, tags: [], appliesTo: { agents: ['agent-a'], workflows: ['workflow-a'], groups: [], communities: [] }, controls: { blockEmail: false, blockWeb: false, blockExternalDocs: false, allowedSkills: [] } } as any, context), ['Agent: Research Agent', 'Workflow: Weekly Report'])
assert.deepEqual(formatPluginTargetNames({ kind: 'eval', name: 'Eval', id: 'e', enabled: true, tags: [], target: { type: 'workflow', ids: ['workflow-a'] }, experiment: { cases: [] }, runs: [] } as any, context), ['workflow: Weekly Report'])
assert.deepEqual(formatPluginTargetNames({ kind: 'lifecycle-view', name: 'Lifecycle', id: 'l', enabled: true, tags: [], fields: { subjectType: 'agent', targetIds: ['agent-a'] } } as any, context), ['agent: Research Agent'])

console.log('pluginTargets.test.ts: 3 tests passed')
