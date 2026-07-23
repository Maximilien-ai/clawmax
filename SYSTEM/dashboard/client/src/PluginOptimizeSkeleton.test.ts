import fs from 'fs'
import path from 'path'

const repoRoot = path.resolve(__dirname, '../../../..')
const pluginRoot = path.join(repoRoot, 'PLUGINS/public/clawmax-optimize')
const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'clawmax-plugin.json'), 'utf-8'))
const templateFiles = fs.readdirSync(path.join(pluginRoot, 'templates')).filter((file) => file.endsWith('.json'))
const templates = templateFiles.map((file) => JSON.parse(fs.readFileSync(path.join(pluginRoot, 'templates', file), 'utf-8')))

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

assert(manifest.apiVersion === 'clawmax.ai/v2', 'Optimize must use the public v2 plugin contract')
assert(manifest.visibility === 'public', 'Optimize must remain public')
assert(manifest.nav.label === 'Optimize', 'Optimize must have a compact navigation label')
assert(manifest.objectKind === 'optimization-plan', 'Optimize must own a generic optimization plan object')
assert(manifest.capabilities.agents === true && manifest.capabilities.workflows === true, 'Optimize must request agent and workflow context')
assert(manifest.recordSchema.required.includes('monthlyTokenBudget'), 'Optimize must treat tokens as a first-class budget')
assert(manifest.recordSchema.required.includes('monthlyCostBudget'), 'Optimize must treat cost as a first-class budget')
assert(manifest.recordSchema.properties.recommendedModel.type === 'string', 'Optimize must support model recommendations')
assert(manifest.recordSchema.properties.recommendedSchedule.type === 'string', 'Optimize must support schedule recommendations')
assert(templateFiles.length === 2, 'Optimize must provide workflow and agent starting points')
assert(templates.every((template) => template.recommended === true), 'Optimize starting points must be suggested items')
assert(new Set(templates.map((template) => template.id)).size === templates.length, 'Optimize starting point IDs must be unique')

console.log('PluginOptimizeSkeleton.test.ts: 12 tests passed')
