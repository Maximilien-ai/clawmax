import assert from 'node:assert/strict'
import { buildNavigationDestinations, pageSearchTerms, searchNavigationDestinations } from './navigationSearch'

const entries = buildNavigationDestinations({
  pages: [
    { page: 'agents', title: 'Agents', terms: 'create chat' },
    { page: 'workflows', title: 'Workflows' },
    { page: 'plugin:clawmax-review', title: 'Review' },
  ],
  agents: [{ id: 'agent-1', name: 'Research Analyst' }, { id: 'archived', name: 'Old Analyst', archived: true }],
  workflows: [{ id: 'wf-1', name: 'Daily Summary', description: 'Summarize findings' }],
  communities: [{ name: 'Research Circle', description: 'Scientific agents' }],
  groups: [{ name: 'Review Group', description: 'Peer review' }],
  templates: [
    { slug: 'research-team', name: 'Research Team', type: 'organization', source: 'system' },
    { id: 'workflow-template', name: 'Weekly Plan', type: 'workflow' },
    { name: 'Invalid', type: 'unknown' },
  ],
  skills: [{ name: 'web-search', description: 'Find sources' }],
  partners: [{ slug: 'cognee', name: 'Cognee', description: 'Memory and semantic context for agents' }],
  documents: [{ path: 'AGENTS/atlas/SOUL.md', section: 'AGENTS' }, { path: 'WORKFLOWS/outputs/daily-report.md', section: 'WORKFLOWS' }],
  modelsByProvider: { openai: { name: 'OpenAI', models: ['openai/gpt-6-sol'] } },
})

assert.deepEqual(searchNavigationDestinations(entries, '').map((entry) => entry.title), ['Agents', 'Workflows', 'Review'])
assert.equal(searchNavigationDestinations(entries, 'research analyst')[0]?.target, 'agent-1')
assert.equal(searchNavigationDestinations(entries, 'summarize')[0]?.target, 'wf-1')
assert.equal(searchNavigationDestinations(entries, 'research team')[0]?.target, 'organization:system:research-team')
assert.equal(searchNavigationDestinations(entries, 'weekly plan')[0]?.target, 'workflow::workflow-template')
assert.equal(searchNavigationDestinations(entries, 'web search')[0]?.page, 'skills')
assert.equal(searchNavigationDestinations(entries, 'create chat')[0]?.page, 'agents')
assert.equal(searchNavigationDestinations(entries, 'old analyst').length, 0)
assert.equal(searchNavigationDestinations(entries, 'invalid').length, 0)
assert.equal(searchNavigationDestinations(buildNavigationDestinations({ pages: [{ page: 'workflows', title: 'Workflows', terms: pageSearchTerms('workflows') }] }), 'run workflow')[0]?.page, 'workflows')
assert.equal(searchNavigationDestinations(entries, 'How do I connect Cognee memory to my agent?')[0]?.target, 'cognee')
assert.equal(searchNavigationDestinations(entries, 'set up partner integrations')[0]?.target, 'partners')
assert.equal(searchNavigationDestinations(entries, 'where are my workspace api keys?')[0]?.target, 'workspace')
assert.equal(searchNavigationDestinations(entries, 'create a new agent')[0]?.target, 'create-agent')
assert.equal(searchNavigationDestinations(entries, 'How do I set my keys?')[0]?.target, 'byok')
assert.equal(searchNavigationDestinations(entries, 'Where can I find skills registries?')[0]?.target, 'skill-import:registry')
assert.equal(searchNavigationDestinations(entries, 'add skill from github')[0]?.target, 'skill-import:github')
assert.equal(searchNavigationDestinations(entries, 'open soul.md for atlas')[0]?.target, 'AGENTS/atlas/SOUL.md')
assert.equal(searchNavigationDestinations(entries, 'find daily report created by workflow')[0]?.target, 'WORKFLOWS/outputs/daily-report.md')
assert.equal(searchNavigationDestinations(entries, 'apply weekly plan workflow template')[0]?.target, 'workflow::workflow-template')
assert.equal(searchNavigationDestinations(entries, 'open research circle community')[0]?.target, 'Research Circle')
assert.equal(searchNavigationDestinations(entries, 'find review group')[0]?.target, 'Review Group')
assert.equal(searchNavigationDestinations(entries, 'configure gpt-6-sol model')[0]?.target, 'openai/gpt-6-sol')
assert.equal(searchNavigationDestinations(buildNavigationDestinations({ pages: [] }), 'gpt-6-sol').length, 0)
console.log('navigationSearch.test.ts: 23 tests passed')
