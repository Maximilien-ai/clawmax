import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  PLUGIN_HOST_API_VERSION,
  PluginContractError,
  assertPluginCapability,
  getPluginBySlug,
  getPluginDiagnosticsReport,
  getPluginGrantedCapabilities,
  listConfiguredPlugins,
  upsertPluginRecord,
} from './plugin-system'
import { resetWorkspaceManagerForTests } from './workspace-manager'

const originalEnv = {
  OPENCLAW_WORKSPACE: process.env.OPENCLAW_WORKSPACE,
  CLAWMAX_TEST_WORKSPACE: process.env.CLAWMAX_TEST_WORKSPACE,
  CLAWMAX_PLUGIN_PATHS: process.env.CLAWMAX_PLUGIN_PATHS,
  CLAWMAX_ENABLED_PLUGINS: process.env.CLAWMAX_ENABLED_PLUGINS,
  CLAWMAX_DISABLE_DEFAULT_PLUGINS: process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS,
  CLAWMAX_ENABLE_TEST_PLUGINS: process.env.CLAWMAX_ENABLE_TEST_PLUGINS,
  CLAWMAX_PLUGIN_SETTINGS_PATH: process.env.CLAWMAX_PLUGIN_SETTINGS_PATH,
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-plugin-schema-edges-'))
const workspace = path.join(root, 'workspace')
const pluginsRoot = path.join(root, 'plugins')
fs.mkdirSync(workspace, { recursive: true })
fs.mkdirSync(pluginsRoot, { recursive: true })

function baseManifest(slug: string): any {
  return {
    apiVersion: PLUGIN_HOST_API_VERSION,
    id: slug,
    slug,
    name: slug,
    description: 'Generic host contract fixture.',
    version: '2.0.0',
    icon: 'plugin',
    objectKind: 'coverage-note',
    visibility: 'public',
    source: { type: 'github', owner: 'example', repo: slug, url: `https://example.invalid/${slug}` },
    nav: { section: 'plugins', order: 10, label: 'Coverage' },
    capabilities: { docs: true },
    recordSchema: {
      type: 'object',
      properties: { note: { type: 'string', title: 'Note' } },
    },
  }
}

function writeManifest(slug: string, manifest: any) {
  const directory = path.join(pluginsRoot, slug)
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, 'clawmax-plugin.json'), JSON.stringify(manifest, null, 2), 'utf8')
}

const invalidFixtures: Array<[string, (manifest: any) => void]> = [
  ['field-null', (m) => { m.recordSchema.properties.note = null }],
  ['field-type', (m) => { m.recordSchema.properties.note.type = 'object' }],
  ['field-title', (m) => { m.recordSchema.properties.note.title = '' }],
  ['enum-shape', (m) => { m.recordSchema.properties.note.enum = 'a' }],
  ['enum-entry', (m) => { m.recordSchema.properties.note.enum = ['a', 2] }],
  ['enum-type', (m) => { m.recordSchema.properties.note = { type: 'number', title: 'Note', enum: ['a'] } }],
  ['format-type', (m) => { m.recordSchema.properties.note = { type: 'number', title: 'Note', format: 'email' } }],
  ['control-name', (m) => { m.recordSchema.properties.note.control = 'textarea' }],
  ['slider-type', (m) => { m.recordSchema.properties.note = { type: 'string', title: 'Note', control: 'slider', minimum: 0, maximum: 1 } }],
  ['slider-min', (m) => { m.recordSchema.properties.note = { type: 'number', title: 'Note', control: 'slider', maximum: 1 } }],
  ['minimum-type', (m) => { m.recordSchema.properties.note.minimum = 0 }],
  ['maximum-type', (m) => { m.recordSchema.properties.note.maximum = 1 }],
  ['step-type', (m) => { m.recordSchema.properties.note = { type: 'number', title: 'Note', step: '1' } }],
  ['step-positive', (m) => { m.recordSchema.properties.note = { type: 'number', title: 'Note', step: 0 } }],
  ['bounds-order', (m) => { m.recordSchema.properties.note = { type: 'number', title: 'Note', minimum: 2, maximum: 1 } }],
  ['array-items', (m) => { m.recordSchema.properties.note = { type: 'array', title: 'Note', items: { type: 'number' } } }],
  ['string-default', (m) => { m.recordSchema.properties.note.default = 1 }],
  ['number-default', (m) => { m.recordSchema.properties.note = { type: 'number', title: 'Note', default: '1' } }],
  ['boolean-default', (m) => { m.recordSchema.properties.note = { type: 'boolean', title: 'Note', default: 'true' } }],
  ['array-default-shape', (m) => { m.recordSchema.properties.note = { type: 'array', title: 'Note', items: { type: 'string' }, default: 'a' } }],
  ['array-default-entry', (m) => { m.recordSchema.properties.note = { type: 'array', title: 'Note', items: { type: 'string' }, default: ['a', 2] } }],
  ['default-below-min', (m) => { m.recordSchema.properties.note = { type: 'number', title: 'Note', minimum: 2, default: 1 } }],
  ['default-above-max', (m) => { m.recordSchema.properties.note = { type: 'number', title: 'Note', maximum: 2, default: 3 } }],
  ['schema-shape', (m) => { m.recordSchema = [] }],
  ['required-shape', (m) => { m.recordSchema.required = 'note' }],
  ['required-missing', (m) => { m.recordSchema.required = ['missing'] }],
  ['property-name', (m) => { m.recordSchema.properties['1note'] = m.recordSchema.properties.note; delete m.recordSchema.properties.note }],
  ['capability-null', (m) => { m.capabilities = null }],
  ['capability-array', (m) => { m.capabilities = [] }],
  ['capability-name', (m) => { m.capabilities = { shell: true } }],
  ['capability-value', (m) => { m.capabilities = { docs: 'yes' } }],
  ['nav-null', (m) => { m.nav = null }],
  ['nav-array', (m) => { m.nav = [] }],
  ['nav-order', (m) => { m.nav.order = 'first' }],
  ['nav-section', (m) => { m.nav.section = 'system' }],
  ['nav-label-type', (m) => { m.nav.label = 42 }],
  ['nav-label-long', (m) => { m.nav.label = 'A'.repeat(25) }],
  ['nav-label-words', (m) => { m.nav.label = 'Too Many Words' }],
  ['nav-extra', (m) => { m.nav.extra = true }],
  ['ui-order', (m) => { m.ui = { form: { order: ['missing'] } } }],
  ['ui-list-field', (m) => { m.ui = { list: { fields: ['missing'] } } }],
  ['ui-group-type', (m) => { m.recordSchema.properties.group = { type: 'boolean', title: 'Group' }; m.ui = { list: { groupBy: 'group' } } }],
  ['ui-check-type', (m) => { m.ui = { list: { checkField: 'note' } } }],
]

for (const [slug, mutate] of invalidFixtures) {
  const manifest = baseManifest(slug)
  mutate(manifest)
  writeManifest(slug, manifest)
}

const monitoringProperties = {
  scope: { type: 'string', title: 'Scope' },
  targetIds: { type: 'array', title: 'Targets', items: { type: 'string' } },
  tokenBudget: { type: 'integer', title: 'Token budget' },
  costBudget: { type: 'number', title: 'Cost budget' },
  currentTokens: { type: 'integer', title: 'Current tokens' },
  currentCost: { type: 'number', title: 'Current cost' },
  state: { type: 'string', title: 'State' },
  summary: { type: 'string', title: 'Summary' },
  lastAssessedAt: { type: 'string', title: 'Last' },
  nextAssessmentAt: { type: 'string', title: 'Next' },
}
const monitoringFields = Object.fromEntries(Object.keys(monitoringProperties).map((key) => [key, key]))
const monitoringFixtures: Array<[string, (manifest: any) => void]> = [
  ['monitor-null', (m) => { m.usageMonitoring = null }],
  ['monitor-kind', (m) => { m.usageMonitoring.kind = 'other' }],
  ['monitor-interval-low', (m) => { m.usageMonitoring.intervalMinutes = 0 }],
  ['monitor-interval-high', (m) => { m.usageMonitoring.intervalMinutes = 1441 }],
  ['monitor-fields-array', (m) => { m.usageMonitoring.fields = [] }],
  ['monitor-fields-missing', (m) => { delete m.usageMonitoring.fields.summary }],
  ['monitor-fields-extra', (m) => { m.usageMonitoring.fields.extra = 'note' }],
  ['monitor-field-type', (m) => { m.recordSchema.properties.currentCost.type = 'string' }],
  ['monitor-capability', (m) => { delete m.capabilities.metering }],
]
for (const [slug, mutate] of monitoringFixtures) {
  const manifest = baseManifest(slug)
  manifest.capabilities.metering = true
  manifest.recordSchema.properties = structuredClone(monitoringProperties)
  manifest.usageMonitoring = { kind: 'metering-budget', intervalMinutes: 15, fields: { ...monitoringFields } }
  mutate(manifest)
  writeManifest(slug, manifest)
}

const validSlug = 'valid-schema-plugin'
const validManifest = baseManifest(validSlug)
validManifest.nav = { section: 'plugins', label: 'Valid' }
validManifest.recordSchema = {
  type: 'object',
  required: ['requiredText'],
  properties: {
    requiredText: { type: 'string', title: 'Required text' },
    mode: { type: 'string', title: 'Mode', enum: ['safe', 'fast'], default: 'safe' },
    ratio: { type: 'number', title: 'Ratio', minimum: 0, maximum: 10, default: 2 },
    count: { type: 'integer', title: 'Count', minimum: 1, maximum: 5, default: 1 },
    enabled: { type: 'boolean', title: 'Enabled', default: true },
    tags: { type: 'array', title: 'Tags', items: { type: 'string' }, default: [] },
  },
}
writeManifest(validSlug, validManifest)

process.env.OPENCLAW_WORKSPACE = workspace
process.env.CLAWMAX_TEST_WORKSPACE = workspace
process.env.CLAWMAX_PLUGIN_PATHS = pluginsRoot
process.env.CLAWMAX_ENABLED_PLUGINS = [validSlug, ...invalidFixtures.map(([slug]) => slug), ...monitoringFixtures.map(([slug]) => slug)].join(',')
process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS = 'true'
process.env.CLAWMAX_ENABLE_TEST_PLUGINS = 'false'
process.env.CLAWMAX_PLUGIN_SETTINGS_PATH = path.join(root, 'settings.json')
resetWorkspaceManagerForTests()

try {
  const report = getPluginDiagnosticsReport()
  for (const [slug] of [...invalidFixtures, ...monitoringFixtures]) {
    assert(report.diagnostics.some((entry) => entry.pluginId === slug && entry.status === 'invalid'), `Expected ${slug} to be rejected`)
  }
  assert(report.diagnostics.some((entry) => entry.pluginId === validSlug && entry.status === 'loaded'))
  assert.deepStrictEqual(listConfiguredPlugins().map((plugin) => plugin.slug), [validSlug])

  const plugin = getPluginBySlug(validSlug)
  assert(plugin)
  assert.deepStrictEqual(getPluginGrantedCapabilities(plugin!), ['docs'])
  assert.doesNotThrow(() => assertPluginCapability(plugin!, 'docs'))
  assert.throws(() => assertPluginCapability(plugin!, 'notifications'), (error: any) => error instanceof PluginContractError && error.statusCode === 403)

  assert.throws(() => upsertPluginRecord(plugin!, { name: 'Missing required field', fields: {} } as any), /Required text is required/)
  const created = upsertPluginRecord(plugin!, {
    fields: {
      requiredText: '  hello  ',
      mode: 'unsupported',
      ratio: 99,
      count: 3.8,
      enabled: false,
      tags: 'alpha, beta, alpha',
    },
  } as any)
  assert.strictEqual(created.name, 'Untitled coverage-note')
  assert('fields' in created)
  assert.deepStrictEqual(created.fields, {
    requiredText: 'hello',
    mode: 'safe',
    ratio: 10,
    count: 3,
    enabled: false,
    tags: ['alpha', 'beta'],
  })

  const updated = upsertPluginRecord(plugin!, {
    id: created.id,
    fields: { requiredText: 'updated', ratio: 'not-a-number', count: -10, tags: 42 },
  } as any)
  assert('fields' in updated)
  assert.strictEqual(updated.fields.ratio, 2)
  assert.strictEqual(updated.fields.count, 1)
  assert.deepStrictEqual(updated.fields.tags, [])

  console.log(`plugin-system-schema-edges.test.ts: ok (${invalidFixtures.length + monitoringFixtures.length + 5} checks)`)
} finally {
  fs.rmSync(root, { recursive: true, force: true })
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  resetWorkspaceManagerForTests()
}
