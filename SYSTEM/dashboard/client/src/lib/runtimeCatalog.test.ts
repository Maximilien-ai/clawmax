/** Run with: npx ts-node --transpileOnly client/src/lib/runtimeCatalog.test.ts */
import assert from 'assert'
import {
  parseRuntimeCatalog, enabledRuntimeIds, runtimeModelsFor, runtimeLabelFor,
  isCliRuntimeSelection, runtimeAcceptsModel, modelAfterRuntimeChange, modelFitCandidates, stripModelProvider,
} from './runtimeCatalog'

const GREEN='\x1b[32m', RED='\x1b[31m', RESET='\x1b[0m'
let passed=0, failed=0
function test(name: string, fn: () => void) {
  try { fn(); console.log(`${GREEN}✓${RESET} ${name}`); passed++ }
  catch (e: any) { console.log(`${RED}✗${RESET} ${name}`); console.log('  '+e.message); failed++ }
}

const payload = {
  runtimes: [
    { id: 'openclaw', label: 'OpenClaw', installed: false },
    { id: 'claude', label: 'Claude Code', installed: true, models: [] },
    { id: 'droid', label: 'Factory Droid', installed: true, models: ['auto', 'claude-sonnet-4-5-20250929'] },
  ],
  enabledRuntimes: ['droid'],
}

console.log('\n=== runtime catalog ===\n')

test('drops openclaw and marks which runtimes are enabled', () => {
  const catalog = parseRuntimeCatalog(payload)
  assert.deepStrictEqual(catalog.map(c => c.id), ['claude', 'droid'])
  assert.deepStrictEqual(enabledRuntimeIds(catalog), ['droid'])
})

test('survives a malformed or error payload', () => {
  assert.deepStrictEqual(parseRuntimeCatalog(null), [])
  assert.deepStrictEqual(parseRuntimeCatalog({ error: 'nope' }), [])
  assert.deepStrictEqual(parseRuntimeCatalog({ runtimes: 'not-an-array' }), [])
})

test('models and labels resolve only for CLI selections', () => {
  const catalog = parseRuntimeCatalog(payload)
  assert.deepStrictEqual(runtimeModelsFor(catalog, 'droid'), ['auto', 'claude-sonnet-4-5-20250929'])
  assert.deepStrictEqual(runtimeModelsFor(catalog, 'default'), [])
  assert.deepStrictEqual(runtimeModelsFor(catalog, 'openclaw'), [])
  assert.strictEqual(runtimeLabelFor(catalog, 'droid'), 'Factory Droid')
  assert.strictEqual(runtimeLabelFor(catalog, 'unknown'), 'unknown')
})

test('default and openclaw are not CLI pins', () => {
  assert.strictEqual(isCliRuntimeSelection('default'), false)
  assert.strictEqual(isCliRuntimeSelection('openclaw'), false)
  assert.strictEqual(isCliRuntimeSelection('droid'), true)
  assert.strictEqual(isCliRuntimeSelection(undefined), false)
})

test('a provider-prefixed model counts as accepted — the rule the two dialogs disagreed on', () => {
  const models = ['claude-sonnet-4-5-20250929']
  assert.strictEqual(runtimeAcceptsModel(models, 'anthropic/claude-sonnet-4-5-20250929'), true)
  assert.strictEqual(runtimeAcceptsModel(models, 'claude-sonnet-4-5-20250929'), true)
  assert.strictEqual(runtimeAcceptsModel(models, 'openai/gpt-4o'), false)
  assert.strictEqual(stripModelProvider('anthropic/claude-x'), 'claude-x')
  assert.strictEqual(stripModelProvider('claude-x'), 'claude-x')
})

test('a runtime that cannot enumerate its catalog accepts anything', () => {
  assert.strictEqual(runtimeAcceptsModel([], 'anything/at-all'), true)
})

test('switching runtime keeps a valid model and otherwise adopts the runtime default', () => {
  const catalog = parseRuntimeCatalog(payload)
  assert.strictEqual(modelAfterRuntimeChange(catalog, 'droid', 'anthropic/claude-sonnet-4-5-20250929'), 'anthropic/claude-sonnet-4-5-20250929')
  // An incompatible model must not survive, but it must not leave the form empty either:
  // the select renders droid's first option, so the form model has to match it or Next
  // stays disabled with the model visibly filled in.
  assert.strictEqual(modelAfterRuntimeChange(catalog, 'droid', 'openai/gpt-4o'), 'auto')
  assert.strictEqual(modelAfterRuntimeChange(catalog, 'droid', ''), 'auto')
  // No enumerable catalog: keep whatever is set rather than clobbering a provider model.
  assert.strictEqual(modelAfterRuntimeChange(catalog, 'default', 'openai/gpt-4o'), 'openai/gpt-4o')
  assert.strictEqual(modelAfterRuntimeChange(catalog, 'claude', 'openai/gpt-4o'), 'openai/gpt-4o')
})

test('fit suggestions are drawn from a pinned runtime\'s own catalog', () => {
  // The suggestion panel ranked the provider catalog for a pinned runtime and presented the
  // winner as "runtime-visible". Applying it wrote an openai/* id onto a Claude Code agent,
  // which then failed on its first chat turn -- the fine-tune-researcher case.
  const catalog = parseRuntimeCatalog(payload)
  const provider = ['openai/gpt-5.3-codex', 'openai/gpt-5.4']
  const droidModels = runtimeModelsFor(catalog, 'droid')
  assert.deepStrictEqual(modelFitCandidates(droidModels, provider), droidModels)
  // No pinned CLI runtime (openclaw/default): the provider catalog is the right pool.
  assert.deepStrictEqual(modelFitCandidates(runtimeModelsFor(catalog, 'default'), provider), provider)
})

test('a provider model is never accepted for a pinned runtime', () => {
  const catalog = parseRuntimeCatalog(payload)
  const droidModels = runtimeModelsFor(catalog, 'droid')
  assert.strictEqual(runtimeAcceptsModel(droidModels, 'openai/gpt-5.3-codex'), false)
  assert.strictEqual(runtimeAcceptsModel(droidModels, 'auto'), true)
})

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
