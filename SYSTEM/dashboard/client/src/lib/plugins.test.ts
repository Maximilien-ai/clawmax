import {
  buildPluginDraftFromPrompt,
  buildGenericPluginFields,
  collectPluginTemplateTags,
  collectPluginTags,
  formatPluginScopeSummary,
  formatPluginDiagnosticsSummary,
  getPluginGrantedCapabilities,
  getPluginCheckField,
  getPluginGroupField,
  getPluginNavLabel,
  formatPluginUpdatedAt,
  formatPluginUsageSummary,
  getEvalReadiness,
  getPluginUsageTotals,
  getPluginDetailLines,
  isGenericPluginRecord,
  matchesPluginTemplateSearch,
  matchesPluginSearch,
  normalizePluginNumericValue,
  normalizePluginNavOrder,
  normalizePluginDiagnosticsReport,
  extractSuggestedEvalRegex,
  scorePluginDraft,
  splitPluginDetailLine,
  sortPluginTemplates,
  validateEvalRegex,
  type PluginManifest,
  type PluginRecord,
  type PluginRecordTemplate,
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
  nav: { section: 'plugins', order: 10, label: 'Evals' },
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
  nav: { section: 'plugins', order: 20, label: 'Guardrails' },
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
  nav: { section: 'plugins', order: 30, label: 'Review' },
  labels: { singular: 'Review Note', plural: 'Review Notes' },
  recordSchema: {
    type: 'object',
    required: ['release', 'notes'],
    properties: {
      release: { type: 'string', title: 'Release' },
      notes: { type: 'string', title: 'Notes', format: 'textarea' },
      completed: { type: 'boolean', title: 'Completed', default: false },
    },
  },
  ui: { form: { order: ['release', 'notes', 'completed'] }, list: { fields: ['completed'], groupBy: 'release', checkField: 'completed' } },
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
  fields: { release: '2.0.0-test-rc4', notes: 'Check acceptance evidence', completed: false },
}

test('plugin navigation and checklist metadata resolve valid compact fields', () => {
  assert(getPluginNavLabel(reviewPlugin) === 'Review', 'Expected compact plugin navigation label')
  assert(getPluginGroupField(reviewPlugin) === 'release', 'Expected release grouping field')
  assert(getPluginCheckField(reviewPlugin) === 'completed', 'Expected checklist completion field')
  assert(getPluginNavLabel({ ...reviewPlugin, nav: undefined }) === 'Review Notes', 'Expected plugin name fallback')
  assert(getPluginGroupField({ ...reviewPlugin, ui: { list: { groupBy: 'completed' } } }) === null, 'Expected non-string group field rejection')
  assert(getPluginCheckField({ ...reviewPlugin, ui: { list: { checkField: 'release' } } }) === null, 'Expected non-boolean check field rejection')
})

test('collectPluginTags returns sorted unique tags', () => {
  const tags = collectPluginTags([guardrail, evalRecord])
  assert(JSON.stringify(tags) === JSON.stringify(['email', 'quality', 'research', 'security']), 'Expected sorted unique tags')
})

test('Eval readiness requires enabled state, targets, trials, cases, and evaluator configuration', () => {
  const readyEval = {
    ...evalRecord,
    experiment: {
      ...evalRecord.experiment,
      iterations: 2,
      cases: [{
        id: 'case-1',
        name: 'Representative case',
        input: { type: 'text' as const, value: 'Summarize the findings' },
        expected: { type: 'text' as const, value: 'A grounded summary' },
      }],
    },
  }
  assert(getEvalReadiness(readyEval).ready, 'Expected configured fixed Eval to be runnable')
  const incomplete = getEvalReadiness({
    ...readyEval,
    enabled: false,
    target: { ...readyEval.target, ids: [] },
    experiment: { ...readyEval.experiment, iterations: 0, input: '', expectedOutput: '', cases: [] },
  })
  assert(!incomplete.ready, 'Expected incomplete Eval to remain blocked')
  assert(incomplete.issues.some((issue) => issue.includes('Enable')), 'Expected enabled-state guidance')
  assert(incomplete.issues.some((issue) => issue.includes('target')), 'Expected target guidance')
  assert(incomplete.issues.some((issue) => issue.includes('planned trial')), 'Expected trial guidance')
  assert(incomplete.issues.some((issue) => issue.includes('trial case')), 'Expected case guidance')
})

test('Eval readiness validates AI and human evaluator assignments', () => {
  const configured = {
    ...evalRecord,
    experiment: { ...evalRecord.experiment, iterations: 1 },
  }
  const ai = getEvalReadiness({ ...configured, experiment: { ...configured.experiment, judge: 'ai', judgeGuidance: '' } })
  assert(ai.issues.some((issue) => issue.includes('AI evaluator')), 'Expected AI evaluator guidance')
  const human = getEvalReadiness({ ...configured, experiment: { ...configured.experiment, judge: 'human', judgeGuidance: '', humanReviewerEmail: '' } })
  assert(human.issues.some((issue) => issue.includes('reviewer email')), 'Expected human reviewer assignment')
})

test('suggested plugin entries support independent tags, search, and sorting', () => {
  const suggestions: PluginRecordTemplate[] = [
    {
      id: 'email',
      pluginId: 'plugin-lab-guardrails',
      name: 'No outbound email',
      description: 'Block external mail',
      objectKind: 'guardrail',
      tags: ['safety', 'email'],
      payload: { name: 'No outbound email' },
    },
    {
      id: 'docs',
      pluginId: 'plugin-lab-guardrails',
      name: 'Internal docs',
      description: 'Keep files private',
      objectKind: 'guardrail',
      tags: ['safety', 'docs'],
      payload: { name: 'Internal docs' },
    },
  ]
  assert(JSON.stringify(collectPluginTemplateTags(suggestions)) === JSON.stringify(['docs', 'email', 'safety']), 'Expected sorted unique suggestion tags')
  assert(matchesPluginTemplateSearch(suggestions[0], 'external mail'))
  assert(matchesPluginTemplateSearch(suggestions[0], 'email external'), 'Expected every search term to match across suggestion metadata')
  assert(!matchesPluginTemplateSearch(suggestions[0], 'email private'), 'Expected a missing search term to exclude the suggestion')
  assert(!matchesPluginTemplateSearch(suggestions[0], 'private files'))
  assert(JSON.stringify(sortPluginTemplates(suggestions, 'name-asc').map((entry) => entry.id)) === JSON.stringify(['docs', 'email']), 'Expected ascending suggestion sort')
  assert(JSON.stringify(sortPluginTemplates(suggestions, 'name-desc').map((entry) => entry.id)) === JSON.stringify(['email', 'docs']), 'Expected descending suggestion sort')
  assert(JSON.stringify(sortPluginTemplates(suggestions, 'recommended').map((entry) => entry.id)) === JSON.stringify(['email', 'docs']), 'Expected original recommendation order')
})

test('matchesPluginSearch finds guardrail targets and controls', () => {
  assert(matchesPluginSearch(guardrail, 'research ops'), 'Expected search to match group name')
  assert(matchesPluginSearch(guardrail, 'workspace-ls'), 'Expected search to match allowed skill')
  assert(matchesPluginSearch(guardrail, 'email'), 'Expected search to match tags and description')
  assert(matchesPluginSearch(guardrail, 'email research'), 'Expected multi-term search across record metadata')
  assert(!matchesPluginSearch(guardrail, 'email zzznotfound'), 'Expected all search terms to be required')
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
  assert(draft.experiment?.iterations === 1, 'Expected a safe default trial count')
})

test('buildPluginDraftFromPrompt prefers AI while recognizing Human and Fixed evaluation', () => {
  const preferred = buildPluginDraftFromPrompt(evalPlugin, 'Evaluate whether the response is helpful and grounded')
  const human = buildPluginDraftFromPrompt(evalPlugin, 'Require a human reviewer for subjective tone approval')
  const fixed = buildPluginDraftFromPrompt(evalPlugin, 'Use a deterministic fixed exact-match check')
  assert(preferred.kind === 'eval' && preferred.experiment?.judge === 'ai', 'Expected AI evaluation to be preferred')
  assert(human.kind === 'eval' && human.experiment?.judge === 'human', 'Expected Human evaluation to be inferred')
  assert(fixed.kind === 'eval' && fixed.experiment?.judge === 'fixed', 'Expected Fixed evaluation to be inferred')
})

test('plugin draft scoring exposes actionable guardrail and eval improvements', () => {
  const guardrailDraft = buildPluginDraftFromPrompt(guardrailPlugin, 'Block outbound email for finance agents')
  const initialGuardrailQuality = scorePluginDraft(guardrailPlugin, guardrailDraft)
  assert(initialGuardrailQuality.score < 100, 'Expected untargeted guardrail draft to remain improvable')
  assert(initialGuardrailQuality.suggestions.some((entry) => /Select at least one/.test(entry)), 'Expected guardrail target guidance')
  const targetedGuardrailQuality = scorePluginDraft(guardrailPlugin, {
    ...guardrailDraft,
    appliesTo: { agents: ['finance'], workflows: ['finance-close'], groups: [], communities: [] },
  })
  assert(targetedGuardrailQuality.score > initialGuardrailQuality.score, 'Expected targeting to improve guardrail quality')

  const evalDraft = buildPluginDraftFromPrompt(evalPlugin, 'Create a workflow eval with ai judge for release quality')
  const initialEvalQuality = scorePluginDraft(evalPlugin, evalDraft)
  assert(initialEvalQuality.suggestions.some((entry) => /Select at least one/i.test(entry)), 'Expected target guidance')
  const completedEvalQuality = scorePluginDraft(evalPlugin, {
    ...evalDraft,
    target: { type: 'workflow', ids: ['release-check'] },
    experiment: {
      input: 'Review the release',
      candidateOutput: 'All checks passed',
      expectedOutput: 'All checks passed',
      judge: 'ai',
      iterations: 3,
      judgeGuidance: 'Score correctness and explain supporting evidence.',
      cases: [{
        id: 'case-1',
        name: 'Release review',
        input: { type: 'text', value: 'Review the release' },
        expected: { type: 'text', value: 'All checks passed' },
      }],
    },
  })
  assert(completedEvalQuality.score > initialEvalQuality.score, 'Expected complete eval configuration to score higher')
})

test('eval regular expression helpers normalize AI output and report invalid patterns', () => {
  assert(extractSuggestedEvalRegex('```regex\n^Approved:\\s+RC-\\d+$\n```') === '^Approved:\\s+RC-\\d+$', 'Expected fenced regex output to normalize')
  assert(extractSuggestedEvalRegex('Regular expression: /success|passed/i') === 'success|passed', 'Expected labeled slash-delimited output to normalize')
  assert(validateEvalRegex('^Approved:\\s+RC-\\d+$') === null, 'Expected a valid regular expression')
  assert(validateEvalRegex('[')?.includes('Invalid regular expression') === true, 'Expected an invalid regular expression error')
  assert(validateEvalRegex('') === 'Enter a regular expression.', 'Expected an empty regular expression error')
})

test('generic v2 plugins build defaults and prompt-backed declarative fields', () => {
  const defaults = buildGenericPluginFields(reviewPlugin)
  assert(defaults.release === '', 'Expected empty release default')
  assert(defaults.completed === false, 'Expected boolean manifest default')
  const draft = buildPluginDraftFromPrompt(reviewPlugin, 'Review the release evidence before promotion')
  assert(isGenericPluginRecord(draft), 'Expected a generic plugin draft')
  assert(draft.kind === 'review-note', 'Expected generic object kind to persist')
  assert(draft.fields.notes === 'Review the release evidence before promotion', 'Expected prompt to populate the declarative textarea')
})

test('numeric plugin controls normalize invalid and out-of-range values', () => {
  const integerSlider = { type: 'integer', title: 'Tokens', default: 100, minimum: 10, maximum: 1000, step: 10 } as const
  assert(normalizePluginNumericValue(integerSlider, 120.9) === 120, 'Expected integer values to truncate')
  assert(normalizePluginNumericValue(integerSlider, -1) === 10, 'Expected values below the minimum to clamp')
  assert(normalizePluginNumericValue(integerSlider, 5000) === 1000, 'Expected values above the maximum to clamp')
  assert(normalizePluginNumericValue(integerSlider, 'invalid') === 100, 'Expected invalid values to use the manifest default')
  assert(normalizePluginNumericValue({ type: 'number', title: 'Cost', minimum: 0, maximum: 100 }, '1.25') === 1.25, 'Expected decimal values to persist')
})

test('generic plugin records participate in search, scope, and declarative detail presentation', () => {
  assert(matchesPluginSearch(reviewRecord, 'acceptance evidence'), 'Expected generic field values in search')
  assert(formatPluginScopeSummary(reviewRecord) === '3 configured fields', 'Expected generic configured field count')
  const lines = getPluginDetailLines(reviewPlugin, reviewRecord)
  assert(lines.includes('Completed: no'), 'Expected boolean list field presentation')
})

test('suggested detail lines split labels from visible values', () => {
  assert(
    JSON.stringify(splitPluginDetailLine('Monthly cost budget: 25')) === JSON.stringify({ label: 'Monthly cost budget', value: '25' }),
    'Expected detail label and value to be split at the first colon',
  )
  assert(
    JSON.stringify(splitPluginDetailLine('Unstructured detail')) === JSON.stringify({ label: 'Detail', value: 'Unstructured detail' }),
    'Expected unstructured details to retain visible text',
  )
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
      { status: 'loaded', pluginId: 'notes', name: 'Notes', path: '/plugins/notes', message: 'Loaded', capabilities: ['docs', 'unknown', 'agents'] },
      { status: 'missing', pluginId: 'mail', path: '', message: 'Not mounted', remediation: 'Mount it' },
      { status: 'unknown', pluginId: 'ignored' },
      null,
    ],
  })
  assert(report.healthy === false, 'Expected client health to reflect actionable diagnostics')
  assert(report.roots.length === 1 && report.roots[0] === '/plugins', 'Expected malformed roots to be filtered')
  assert(report.diagnostics.length === 2, 'Expected unknown diagnostics to be filtered')
  assert(report.summary.loaded === 1 && report.summary.missing === 1, 'Expected status counts to be recomputed')
  assert(report.diagnostics[0].capabilities.join(',') === 'docs,agents', 'Expected known grants in stable display order')
})

test('getPluginGrantedCapabilities reports only enabled grants in stable order', () => {
  const plugin = { capabilities: { communications: true, docs: true, agents: false } } as any
  assert(getPluginGrantedCapabilities(plugin).join(',') === 'docs,communications', 'Expected enabled capability grants only')
})

test('normalizePluginNavOrder keeps release order, resets stale inventory, and preserves complete browser order', () => {
  const optimizePlugin = {
    ...reviewPlugin,
    id: 'clawmax-optimize',
    slug: 'clawmax-optimize',
    name: 'Optimize',
    objectKind: 'optimization-plan',
    nav: { order: 30, section: 'plugins' as const, label: 'Optimize' },
  }
  const defaults = normalizePluginNavOrder(
    [reviewPlugin, evalPlugin, optimizePlugin, guardrailPlugin],
    null,
  )
  assert(defaults.map((plugin) => plugin.slug).join(',') === 'plugin-lab-evals,plugin-lab-guardrails,clawmax-optimize,plugin-lab-review-notes', 'Expected Evals, Guardrails, Optimize, and Review default order')

  const stale = normalizePluginNavOrder(
    [reviewPlugin, evalPlugin, optimizePlugin, guardrailPlugin],
    ['clawmax-optimize', 'plugin-lab-review-notes', 'missing', 'clawmax-optimize'],
  )
  assert(stale.map((plugin) => plugin.slug).join(',') === defaults.map((plugin) => plugin.slug).join(','), 'Expected a stale partial inventory to reset to release order')

  const saved = normalizePluginNavOrder(
    [reviewPlugin, evalPlugin, optimizePlugin, guardrailPlugin],
    ['clawmax-optimize', 'plugin-lab-evals', 'plugin-lab-review-notes', 'plugin-lab-guardrails'],
  )
  assert(saved[0].slug === 'clawmax-optimize' && saved[1].slug === 'plugin-lab-evals', 'Expected a complete saved browser order to win')
  assert(new Set(saved.map((plugin) => plugin.slug)).size === 4, 'Expected duplicate and missing saved entries to be normalized')
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
