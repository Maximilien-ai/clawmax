import { collectPluginTags, formatPluginScopeSummary, formatPluginUpdatedAt, matchesPluginSearch, type PluginRecord } from './plugins'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (err: any) {
    console.error(`✗ ${name}`)
    console.error(err.message)
    process.exitCode = 1
  }
}

const guardrail: PluginRecord = {
  id: 'guardrail-1',
  kind: 'guardrail',
  name: 'No outbound send',
  description: 'Blocks outbound email and document sharing',
  tags: ['security', 'email'],
  enabled: true,
  createdAt: '2026-06-10T00:00:00.000Z',
  updatedAt: '2026-06-10T00:00:00.000Z',
  appliesTo: {
    agents: ['analyst'],
    workflows: ['research-sweep'],
    groups: ['Research Ops'],
    communities: ['Research'],
  },
  controls: {
    blockEmail: true,
    blockWeb: false,
    blockExternalDocs: true,
    allowedSkills: ['workspace-ls'],
  },
}

const evalRecord: PluginRecord = {
  id: 'eval-1',
  kind: 'eval',
  name: 'Analyst summary eval',
  description: 'Scores candidate summary quality',
  tags: ['quality', 'research'],
  enabled: true,
  createdAt: '2026-06-10T00:00:00.000Z',
  updatedAt: '2026-06-10T00:00:00.000Z',
  target: {
    type: 'agent',
    ids: ['analyst'],
  },
  experiment: {
    input: 'Summarize the workspace findings',
    candidateOutput: 'Research summary with agent notes',
    expectedOutput: 'research summary agent notes',
    judge: 'fixed',
  },
  runs: [],
  lastRun: null,
}

test('collectPluginTags returns sorted unique tags', () => {
  const tags = collectPluginTags([guardrail, evalRecord])
  assert(JSON.stringify(tags) === JSON.stringify(['email', 'quality', 'research', 'security']), 'Expected sorted unique tags')
})

test('matchesPluginSearch finds guardrail targets and controls', () => {
  assert(matchesPluginSearch(guardrail, 'research ops'), 'Expected search to match group name')
  assert(matchesPluginSearch(guardrail, 'workspace-ls'), 'Expected search to match allowed skill')
  assert(matchesPluginSearch(guardrail, 'email'), 'Expected search to match tags and description')
})

test('matchesPluginSearch finds eval experiment fields and rejects nonsense', () => {
  assert(matchesPluginSearch(evalRecord, 'agent notes'), 'Expected search to match eval experiment text')
  assert(matchesPluginSearch(evalRecord, 'fixed'), 'Expected search to match judge mode')
  assert(!matchesPluginSearch(evalRecord, 'zzznotfound'), 'Expected nonsense query to miss eval record')
})

test('formatPluginScopeSummary summarizes guardrails and evals consistently', () => {
  assert(formatPluginScopeSummary(guardrail) === '1 agents · 1 workflows · 1 groups · 1 communities', 'Expected guardrail scope summary')
  assert(formatPluginScopeSummary(evalRecord) === 'agent · 1 targets · 0 runs', 'Expected eval scope summary')
})

test('formatPluginUpdatedAt formats stable dates and guards invalid values', () => {
  assert(formatPluginUpdatedAt(guardrail) === 'Jun 10, 2026', 'Expected formatted updated date')
  assert(formatPluginUpdatedAt({ ...guardrail, updatedAt: 'not-a-date' }) === 'unknown', 'Expected invalid dates to be guarded')
})

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode)
}

console.log('plugins.test.ts: ok')
