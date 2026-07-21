import {
  buildPluginDraftFromPrompt,
  buildGenericPluginFields,
  collectPluginTags,
  formatPluginScopeSummary,
  formatPluginDiagnosticsSummary,
  formatPluginUpdatedAt,
  formatPluginUsageSummary,
  getPluginUsageTotals,
  getPluginDetailLines,
  isGenericPluginRecord,
  matchesPluginSearch,
  normalizePluginDiagnosticsReport,
  type PluginManifest,
  type PluginRecord,
} from './plugins'

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

const evalPlugin: PluginManifest = {
  id: 'evals',
  slug: 'plugin-lab-evals',
  name: 'Evals',
  description: 'Workspace eval plugin',
  version: '0.1.0',
  icon: 'beaker',
  objectKind: 'eval',
  visibility: 'private',
  source: {
    type: 'github',
    owner: 'example',
    repo: 'plugin-lab-evals',
    url: 'https://example.invalid/plugin-lab-evals',
  },
}

const guardrailPlugin: PluginManifest = {
  id: 'guardrails',
  slug: 'plugin-lab-guardrails',
  name: 'Guardrails',
  description: 'Workspace guardrail plugin',
  version: '0.1.0',
  icon: 'shield',
  objectKind: 'guardrail',
  visibility: 'private',
  labels: {
    singular: 'Guardrail',
    plural: 'Guardrails',
  },
  source: {
    type: 'github',
    owner: 'example',
    repo: 'plugin-lab-guardrails',
    url: 'https://example.invalid/plugin-lab-guardrails',
  },
}

const reviewPlugin: PluginManifest = {
  apiVersion: 'clawmax.ai/v2',
  id: 'review-notes',
  slug: 'plugin-lab-review-notes',
  name: 'Review Notes',
  description: 'Generic review notes',
  version: '0.2.0',
  icon: 'docs',
  objectKind: 'review-note',
  visibility: 'private',
  source: { type: 'github', owner: 'example', repo: 'review-notes', url: 'https://example.invalid/review-notes' },
  labels: { singular: 'Review Note', plural: 'Review Notes' },
  recordSchema: {
    type: 'object',
    required: ['priority', 'notes'],
    properties: {
      priority: { type: 'string', title: 'Priority', enum: ['low', 'medium', 'high'], default: 'medium' },
      notes: { type: 'string', title: 'Notes', format: 'textarea' },
      approved: { type: 'boolean', title: 'Approved', default: false },
    },
  },
  ui: { form: { order: ['priority', 'notes', 'approved'] }, list: { fields: ['priority', 'approved'] } },
}

const reviewRecord: PluginRecord = {
  id: 'review-1',
  kind: 'review-note',
  name: 'Release review',
  description: 'Review release readiness',
  tags: ['release'],
  enabled: true,
  createdAt: '2026-07-15T00:00:00.000Z',
  updatedAt: '2026-07-15T00:00:00.000Z',
  fields: { priority: 'high', notes: 'Check acceptance evidence', approved: false },
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

test('buildPluginDraftFromPrompt creates a guardrail draft from natural language', () => {
  const draft = buildPluginDraftFromPrompt(guardrailPlugin, 'Block outbound email and external document sharing for finance agents')
  assert(draft.kind === 'guardrail', 'Expected guardrail draft')
  assert(draft.controls?.blockEmail === true, 'Expected guardrail draft to block email')
  assert(draft.controls?.blockExternalDocs === true, 'Expected guardrail draft to block external docs')
  assert(Array.isArray(draft.tags) && draft.tags.includes('block'), 'Expected draft tags to be inferred')
})

test('buildPluginDraftFromPrompt creates an eval draft from natural language', () => {
  const draft = buildPluginDraftFromPrompt(evalPlugin, 'Create a workflow eval with ai judge for release quality')
  assert(draft.kind === 'eval', 'Expected eval draft')
  assert(draft.target?.type === 'workflow', 'Expected workflow target to be inferred')
  assert(draft.experiment?.judge === 'ai', 'Expected AI judge to be inferred')
})

test('generic v2 plugins build defaults and prompt-backed declarative fields', () => {
  const defaults = buildGenericPluginFields(reviewPlugin)
  assert(defaults.priority === 'medium', 'Expected manifest default for priority')
  assert(defaults.approved === false, 'Expected boolean manifest default')
  const draft = buildPluginDraftFromPrompt(reviewPlugin, 'Review the release evidence before promotion')
  assert(isGenericPluginRecord(draft), 'Expected a generic plugin draft')
  assert(draft.kind === 'review-note', 'Expected generic object kind to persist')
  assert(draft.fields.notes === 'Review the release evidence before promotion', 'Expected prompt to populate the declarative textarea')
})

test('generic plugin records participate in search, scope, and declarative detail presentation', () => {
  assert(matchesPluginSearch(reviewRecord, 'acceptance evidence'), 'Expected generic field values in search')
  assert(formatPluginScopeSummary(reviewRecord) === '3 configured fields', 'Expected generic configured field count')
  const lines = getPluginDetailLines(reviewPlugin, reviewRecord)
  assert(lines.includes('Priority: high'), 'Expected configured list field presentation')
  assert(lines.includes('Approved: no'), 'Expected boolean list field presentation')
})

test('getPluginUsageTotals aggregates eval runs for plugin usage surfaces', () => {
  const record: PluginRecord = {
    ...evalRecord,
    runs: [
      { id: 'run-1', score: 82, summary: 'Good', judgeMode: 'fixed', tokensIn: 120, tokensOut: 80, costUsd: 0.0123, createdAt: '2026-06-10T00:00:00.000Z' },
      { id: 'run-2', score: 91, summary: 'Better', judgeMode: 'ai-placeholder', tokensIn: 90, tokensOut: 60, costUsd: 0.0087, createdAt: '2026-06-10T01:00:00.000Z' },
    ],
  }
  const totals = getPluginUsageTotals(record)
  assert(totals.runs === 2, 'Expected run count aggregate')
  assert(totals.tokens === 350, 'Expected token aggregate')
  assert(Math.abs(totals.costUsd - 0.021) < 0.000001, 'Expected cost aggregate')
})

test('formatPluginUsageSummary returns stable summaries for evals and non-evals', () => {
  const record: PluginRecord = {
    ...evalRecord,
    runs: [{ id: 'run-1', score: 80, summary: 'ok', judgeMode: 'fixed', tokensIn: 50, tokensOut: 25, costUsd: 0.0042, createdAt: '2026-06-10T00:00:00.000Z' }],
  }
  assert(formatPluginUsageSummary(guardrail) === 'No usage', 'Expected non-evals to report no usage')
  assert(formatPluginUsageSummary(record) === '1 runs · 75 tokens · $0.0042', 'Expected eval usage summary')
})

test('normalizePluginDiagnosticsReport filters malformed entries and recomputes health', () => {
  const report = normalizePluginDiagnosticsReport({
    healthy: true,
    hostApiVersion: 'clawmax.ai/v2',
    roots: ['/plugins', 42],
    diagnostics: [
      { status: 'loaded', pluginId: 'notes', name: 'Notes', path: '/plugins/notes', message: 'Loaded' },
      { status: 'missing', pluginId: 'mail', path: '', message: 'Not mounted', remediation: 'Mount it' },
      { status: 'unknown', pluginId: 'ignored' },
      null,
    ],
  })
  assert(report.healthy === false, 'Expected client health to reflect actionable diagnostics')
  assert(report.roots.length === 1 && report.roots[0] === '/plugins', 'Expected malformed roots to be filtered')
  assert(report.diagnostics.length === 2, 'Expected unknown diagnostics to be filtered')
  assert(report.summary.loaded === 1 && report.summary.missing === 1, 'Expected status counts to be recomputed')
})

test('formatPluginDiagnosticsSummary distinguishes healthy, unhealthy, and empty hosts', () => {
  const unhealthy = normalizePluginDiagnosticsReport({ diagnostics: [
    { status: 'loaded', pluginId: 'notes', message: 'Loaded' },
    { status: 'invalid', pluginId: 'mail', message: 'Invalid' },
  ] })
  assert(formatPluginDiagnosticsSummary(unhealthy) === '1 issue · 1 loaded', 'Expected actionable issue summary')
  const healthy = normalizePluginDiagnosticsReport({ diagnostics: [
    { status: 'loaded', pluginId: 'notes', message: 'Loaded' },
    { status: 'disabled', pluginId: 'mail', message: 'Disabled' },
  ] })
  assert(formatPluginDiagnosticsSummary(healthy) === '1 loaded · 1 disabled', 'Expected healthy load summary')
  assert(formatPluginDiagnosticsSummary(normalizePluginDiagnosticsReport(null)) === 'No plugins discovered', 'Expected empty host summary')
})

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode)
}

console.log('plugins.test.ts: ok')
