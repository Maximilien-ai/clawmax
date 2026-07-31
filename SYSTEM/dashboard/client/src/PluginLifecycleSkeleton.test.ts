import fs from 'fs'
import path from 'path'

const repoRoot = path.resolve(__dirname, '../../../..')
const pluginRoot = path.join(repoRoot, 'PLUGINS/public/clawmax-lifecycle')
const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'clawmax-plugin.json'), 'utf-8'))
const readme = fs.readFileSync(path.join(pluginRoot, 'README.md'), 'utf-8')
const changelog = fs.readFileSync(path.join(pluginRoot, 'CHANGELOG.md'), 'utf-8')
const pluginPage = fs.readFileSync(path.join(__dirname, 'pages', 'PluginWorkspacePage.tsx'), 'utf-8')
const templates = fs.readdirSync(path.join(pluginRoot, 'templates'))
  .filter((file) => file.endsWith('.json'))
  .map((file) => JSON.parse(fs.readFileSync(path.join(pluginRoot, 'templates', file), 'utf-8')))

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

assert(manifest.apiVersion === 'clawmax.ai/v2', 'Lifecycle must use the public declarative plugin contract')
assert(manifest.visibility === 'public', 'Lifecycle must remain public')
assert(manifest.enabledByDefault === true, 'Lifecycle must load in the public image by default')
assert(manifest.objectKind === 'lifecycle-view', 'Lifecycle must own a neutral inspection object')
assert(manifest.nav.label === 'Lifecycle', 'Lifecycle must have a compact navigation label')
assert(manifest.capabilities.agents === true && manifest.capabilities.workflows === true, 'Lifecycle must inspect agents and workflows')
assert(manifest.recordSchema.required.includes('subjectType'), 'Lifecycle must require an object type')
assert(manifest.recordSchema.properties.targetIds.type === 'array', 'Lifecycle must select workspace objects')
assert(manifest.recordSchema.properties.focus.enum.includes('activity'), 'Lifecycle must support activity-focused inspection')
assert(manifest.recordSchema.properties.focus.enum.includes('artifacts'), 'Lifecycle must support artifact-focused inspection')
assert(manifest.recordSchema.properties.timeWindow.enum.includes('30-days'), 'Lifecycle must expose bounded history windows')
assert(templates.length === 2, 'Lifecycle must start with one agent and one workflow inspection')
assert(templates.some((entry) => entry.payload.fields.subjectType === 'agent'), 'Lifecycle must suggest an agent inspection')
assert(templates.some((entry) => entry.payload.fields.subjectType === 'workflow'), 'Lifecycle must suggest a workflow inspection')
assert(templates.every((entry) => entry.payload.fields.targetIds.length === 0), 'Lifecycle suggestions must require an explicit workspace target')
assert(readme.includes('does not enforce policy, score quality, or change runtime configuration'), 'Lifecycle must document its non-enterprise boundary')
assert(changelog.includes(manifest.version), 'Lifecycle changelog must cover its manifest version')
assert(pluginPage.includes("const isLifecycle = plugin.objectKind === 'lifecycle-view'"), 'Lifecycle must use workspace-aware target selection')
assert(pluginPage.includes("plugin.objectKind === 'lifecycle-view' ? 'Inspects' : 'Applies to'"), 'Lifecycle relationships must use inspection language')

console.log('PluginLifecycleSkeleton.test.ts: 19 tests passed')
