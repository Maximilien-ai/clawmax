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
assert(checklist.release === '2.0.0-test-rc6', 'Checklist file must identify exactly one release')
assert(checklist.items.length === 13, 'RC6 must ship with the complete thirteen-item acceptance checklist')
assert(new Set(checklist.items.map((item: any) => item.id)).size === checklist.items.length, 'Checklist item IDs must be unique within the release')
assert(checklist.items.every((item: any) => item.fields.notes === ''), 'New checklist notes must start empty and visually neutral')
assert(checklist.defaults.fields.completed === false, 'Each new release checklist must start unchecked')
assert(checklist.defaults.fields.outcome === 'pending', 'Each new release checklist must start pending')
assert(pageSource.includes('const isChecklist = Boolean(groupField && checkField)'), 'Checklist presentation must be manifest-driven')
assert(pageSource.includes('Start {release} checklist'), 'Review page must initialize a release with one clear action')
assert(pageSource.includes('function ChecklistItemRow'), 'Review page must render checklist rows instead of template cards')
assert(pageSource.includes("{notes ? 'Edit notes' : 'Add notes'}"), 'Checklist rows must expose note editing directly')
assert(pageSource.includes('aria-label="Release checklists"'), 'Review page must expose release tabs accessibly')
assert(pageSource.includes('const toggleCheck = async'), 'Review page must persist direct checkbox changes')
assert(pageSource.includes('isChecklist ? ('), 'Checklist templates must not use the generic recommended template catalog')
assert(pageSource.includes('const setChecklistOutcome = async'), 'Review page must persist explicit pass and fail outcomes')
assert(pageSource.includes('aria-label={`Mark ${item.name} failed`}'), 'Checklist rows must expose a direct accessible fail action')
assert(pageSource.includes("outcome === 'failed'"), 'Failed checks must have a distinct visual state')
assert(pageSource.includes("completed ? 'line-through"), 'Completed checks must be crossed out')
assert(pageSource.includes(": notes\n          ? 'bg-yellow"), 'Commented pending checks must be highlighted')
assert(pageSource.includes('w-full min-w-0 max-w-7xl overflow-x-hidden'), 'Plugin pages must constrain narrow-screen horizontal overflow')
assert(pageSource.includes('min-w-0 overflow-hidden rounded-lg border border-sky-200'), 'Suggested cards must shrink within phone viewports')

console.log('PluginReviewChecklist.test.ts: 23 tests passed')
