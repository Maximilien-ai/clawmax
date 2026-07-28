import fs from 'fs'
import path from 'path'

const repoRoot = path.resolve(__dirname, '../../../..')
const pluginRoot = path.join(repoRoot, 'PLUGINS/public/clawmax-optimize')
const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'clawmax-plugin.json'), 'utf-8'))
const readme = fs.readFileSync(path.join(pluginRoot, 'README.md'), 'utf-8')
const changelog = fs.readFileSync(path.join(pluginRoot, 'CHANGELOG.md'), 'utf-8')
const templateFiles = fs.readdirSync(path.join(pluginRoot, 'templates')).filter((file) => file.endsWith('.json'))
const templates = templateFiles.map((file) => JSON.parse(fs.readFileSync(path.join(pluginRoot, 'templates', file), 'utf-8')))

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

assert(manifest.apiVersion === 'clawmax.ai/v2', 'Optimize must use the public v2 plugin contract')
assert(readme.includes('automatic model settings'), 'Optimize must document automatic model-selection recommendations')
assert(changelog.includes(manifest.version), 'Optimize changelog must cover the manifest version')
assert(manifest.visibility === 'public', 'Optimize must remain public')
assert(manifest.nav.label === 'Optimize', 'Optimize must have a compact navigation label')
assert(manifest.objectKind === 'optimization-plan', 'Optimize must own a generic optimization plan object')
assert(manifest.capabilities.agents === true && manifest.capabilities.workflows === true, 'Optimize must request agent and workflow context')
assert(manifest.recordSchema.required.includes('monthlyTokenBudget'), 'Optimize must treat tokens as a first-class budget')
assert(manifest.recordSchema.required.includes('monthlyCostBudget'), 'Optimize must treat cost as a first-class budget')
assert(manifest.recordSchema.required.includes('optimizationGoal'), 'Optimize must require an explicit optimization priority')
assert(manifest.recordSchema.properties.perRunTokenBudget.type === 'integer', 'Optimize must support per-run token budgets')
assert(manifest.recordSchema.properties.perRunCostBudget.type === 'number', 'Optimize must support per-run cost budgets')
assert(manifest.recordSchema.properties.maximumRunDurationSeconds.type === 'integer', 'Optimize must support workflow latency limits')
assert(manifest.recordSchema.properties.minimumQualityScore.type === 'number', 'Optimize must preserve a measurable quality floor')
assert(manifest.recordSchema.properties.automaticModelSelection.type === 'boolean', 'Optimize must support automatic agent model selection')
assert(
  JSON.stringify(manifest.recordSchema.properties.modelPriority.enum) === JSON.stringify(['quality', 'balanced', 'cost']),
  'Optimize must use agent model-selection priorities',
)
assert(manifest.recordSchema.properties.recommendedModel.type === 'string', 'Optimize must support model recommendations')
assert(manifest.recordSchema.properties.recommendedSchedule.type === 'string', 'Optimize must support schedule recommendations')
assert(templateFiles.length >= 8, 'Optimize must provide at least eight distinct workspace, workflow, and agent starting points')
assert(templates.every((template) => template.recommended === true), 'Optimize starting points must be suggested items')
assert(new Set(templates.map((template) => template.id)).size === templates.length, 'Optimize starting point IDs must be unique')
assert(templates.every((template) => template.payload.fields.optimizationGoal), 'Optimize suggestions must declare their primary goal')
const declaredFields = new Set(Object.keys(manifest.recordSchema.properties))
assert(
  templates.every((template) => Object.keys(template.payload.fields).every((field) => declaredFields.has(field))),
  'Optimize suggestions must only use fields declared by the public manifest',
)
assert(
  templates.every((template) => manifest.recordSchema.properties.optimizationGoal.enum.includes(template.payload.fields.optimizationGoal)),
  'Optimize suggestions must use a supported optimization goal',
)
assert(
  templates.every((template) => manifest.recordSchema.properties.modelPriority.enum.includes(template.payload.fields.modelPriority)),
  'Optimize suggestions must use an agent-compatible model priority',
)
assert(
  templates.every((template) => template.payload.fields.minimumQualityScore > 0),
  'Optimize suggestions must preserve a positive quality floor',
)
assert(templates.some((template) => template.payload.fields.scope === 'workspace'), 'Optimize must include a workspace budget starting point')
assert(
  templates.some((template) => template.payload.fields.scope === 'agent')
    && templates.some((template) => template.payload.fields.scope === 'workflow'),
  'Optimize must cover both agent and workflow plans',
)
assert(templates.some((template) => template.payload.fields.recommendedSchedule), 'Optimize must include a schedule starting point')
assert(templates.some((template) => template.tags.includes('model')), 'Optimize must include a model-efficiency starting point')
assert(templates.some((template) => template.payload.fields.automaticModelSelection === true), 'Optimize must suggest automatic model selection where appropriate')
for (const dimension of ['quality', 'speed', 'tokens', 'cost']) {
  assert(templates.some((template) => template.tags.includes(dimension)), `Optimize must include ${dimension} coverage`)
}

console.log('PluginOptimizeSkeleton.test.ts: 35 tests passed')
