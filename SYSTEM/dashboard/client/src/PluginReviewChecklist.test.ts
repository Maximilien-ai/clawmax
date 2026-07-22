import fs from 'fs'
import path from 'path'

const repoRoot = path.resolve(__dirname, '../../../..')
const pluginRoot = path.join(repoRoot, 'PLUGINS/test/plugin-lab-review-notes')
const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'clawmax-plugin.json'), 'utf-8'))
const pageSource = fs.readFileSync(path.join(__dirname, 'pages/PluginWorkspacePage.tsx'), 'utf-8')
const checklistFiles = fs.readdirSync(path.join(pluginRoot, 'templates')).filter((file) => file.endsWith('.json'))
const checklist = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'templates', checklistFiles[0]), 'utf-8'))

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

assert(manifest.nav.label === 'Review', 'Review plugin must use a compact navigation label')
assert(manifest.ui.list.groupBy === 'release', 'Review records must be compartmentalized by release')
assert(manifest.ui.list.checkField === 'completed', 'Review records must declare their completion checkbox')
assert(checklistFiles.length === 1, 'Each release must be defined by one checklist file')
assert(checklist.release === '2.0.0-test-rc5', 'Checklist file must identify exactly one release')
assert(checklist.items.length === 8, 'RC5 must ship with the complete eight-item acceptance checklist')
assert(new Set(checklist.items.map((item: any) => item.id)).size === checklist.items.length, 'Checklist item IDs must be unique within the release')
assert(checklist.defaults.fields.completed === false, 'Each new release checklist must start unchecked')
assert(checklist.defaults.fields.outcome === 'pending', 'Each new release checklist must start pending')
assert(pageSource.includes('const isChecklist = Boolean(groupField && checkField)'), 'Checklist presentation must be manifest-driven')
assert(pageSource.includes('Start {release} checklist'), 'Review page must initialize a release with one clear action')
assert(pageSource.includes('function ChecklistItemRow'), 'Review page must render checklist rows instead of template cards')
assert(pageSource.includes("{notes ? 'Edit notes' : 'Add notes'}"), 'Checklist rows must expose note editing directly')
assert(pageSource.includes('aria-label="Release checklists"'), 'Review page must expose release tabs accessibly')
assert(pageSource.includes('const toggleCheck = async'), 'Review page must persist direct checkbox changes')
assert(pageSource.includes('isChecklist ? ('), 'Checklist templates must not use the generic recommended template catalog')

console.log('PluginReviewChecklist.test.ts: 16 tests passed')
