import fs from 'fs'
import path from 'path'

const repoRoot = path.resolve(__dirname, '../../../..')
const pluginRoot = path.join(repoRoot, 'PLUGINS/test/plugin-lab-review-notes')
const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'clawmax-plugin.json'), 'utf-8'))
const pageSource = fs.readFileSync(path.join(__dirname, 'pages/PluginWorkspacePage.tsx'), 'utf-8')
const templates = fs.readdirSync(path.join(pluginRoot, 'templates'))
  .filter((file) => file.endsWith('.json'))
  .map((file) => JSON.parse(fs.readFileSync(path.join(pluginRoot, 'templates', file), 'utf-8')))

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

assert(manifest.nav.label === 'Review', 'Review plugin must use a compact navigation label')
assert(manifest.ui.list.groupBy === 'release', 'Review records must be compartmentalized by release')
assert(manifest.ui.list.checkField === 'completed', 'Review records must declare their completion checkbox')
assert(templates.length === 8, 'RC4 must ship with the complete eight-item acceptance checklist')
assert(new Set(templates.map((template) => template.id)).size === templates.length, 'Checklist template IDs must be unique')
assert(templates.every((template) => template.payload.fields.release === '2.0.0-test-rc4'), 'Checklist templates must not overlap releases')
assert(templates.every((template) => template.payload.fields.completed === false), 'Each new release checklist must start unchecked')
assert(pageSource.includes('applyRecommendedTemplates'), 'Review page must support adding a complete checklist in one action')
assert(pageSource.includes('aria-label="Release checklists"'), 'Review page must expose release tabs accessibly')
assert(pageSource.includes('const toggleCheck = async'), 'Review page must persist direct checkbox changes')

console.log('PluginReviewChecklist.test.ts: 10 tests passed')
