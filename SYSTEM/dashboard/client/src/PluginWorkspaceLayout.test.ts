import assert from 'assert'
import fs from 'fs'
import path from 'path'

const sourceRoot = path.resolve(__dirname)
const agentsSource = fs.readFileSync(path.join(sourceRoot, 'pages/Agents.tsx'), 'utf8')
const appSource = fs.readFileSync(path.join(sourceRoot, 'App.tsx'), 'utf8')
const pluginPageSource = fs.readFileSync(path.join(sourceRoot, 'pages/PluginWorkspacePage.tsx'), 'utf8')
const repoRoot = path.resolve(sourceRoot, '../../../..')
const manifests = [
  'PLUGINS/test/plugin-lab-guardrails/clawmax-plugin.json',
  'PLUGINS/test/plugin-lab-evals/clawmax-plugin.json',
  'PLUGINS/test/plugin-lab-review-notes/clawmax-plugin.json',
  'PLUGINS/public/clawmax-optimize/clawmax-plugin.json',
].map((relativePath) => JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')))

assert(
  agentsSource.includes('costTrackingEnabled = true, guardrails = []'),
  'Agent grid cards must receive a safe guardrail relationship default',
)
assert(
  (agentsSource.match(/guardrails=\{pluginRelationships\.agents\[agent\.id\] \|\| \[\]\}/g) || []).length >= 5,
  'Every agent card rendering path must receive plugin relationships',
)
assert(appSource.includes('h-[100dvh] max-h-[100dvh]'), 'The mobile sidebar must fit the dynamic viewport')
assert(appSource.includes('h-[100dvh] w-full min-w-0 overflow-hidden'), 'The app shell must not widen past the phone viewport')
assert(appSource.includes('function ChecklistIcon'), 'Release Review must have a checklist navigation icon')
assert(appSource.includes("plugin.objectKind === 'optimization-plan'"), 'Optimize must have a distinct activity navigation icon')
assert(pluginPageSource.includes("viewMode === 'grid' ? ("), 'Plugin content must render a compact grid view')
assert(pluginPageSource.includes("viewMode === 'detail' ? ("), 'Plugin content must render a detail view')
assert(pluginPageSource.includes("viewMode === 'graph' ? ("), 'Plugin content must render a relationship view')
assert(pluginPageSource.includes('selectedSuggestedTemplateId'), 'Suggested items must expose inspectable details')
assert(pluginPageSource.includes('heading="Suggested item"'), 'Suggested relationship views must identify their own records')
assert(pluginPageSource.includes("type PluginCollectionTab = 'active' | 'archived' | 'suggested'"), 'Suggested entries must live in a separate collection tab')
assert(pluginPageSource.includes('Suggested ({recommendedTemplates.length})'), 'The Suggested tab must show its available entry count')
assert(pluginPageSource.includes("collectionTab === 'suggested' && ("), 'Suggested search and filter controls must render only inside the Suggested tab')
assert(pluginPageSource.includes('value={suggestionSort}'), 'Suggested entries must expose independent sorting')
assert(pluginPageSource.includes('suggestionTags'), 'Suggested entries must expose independent tag filters')
assert(pluginPageSource.includes("setCollectionTab('active')"), 'Using a suggestion must return users to their active workspace entries')
assert(pluginPageSource.includes('const hasLoadedRef = useRef(false)'), 'Revisited plugin pages must retain rendered data during background refreshes')
assert(pluginPageSource.includes('const [contextRes, itemsRes, templatesRes] = await Promise.all(['), 'Plugin context, items, and suggestions must load in parallel')
assert(pluginPageSource.includes("forceTemplateRefresh ? '?refresh=1' : ''"), 'The explicit Refresh action must bypass the suggestion cache')
assert(pluginPageSource.includes('Actions <span className="text-xs">▾</span>'), 'Plugin refresh belongs in the standard Actions menu')
assert(appSource.includes('PLUGIN_NAV_ORDER_STORAGE_KEY'), 'Plugin navigation order must persist in the current browser')
assert(appSource.includes('handlePluginDragOver'), 'Plugin navigation items must support reordering')
assert(appSource.includes('PLUGIN_NAV_EXPANDED_STORAGE_KEY'), 'Plugin section expansion must persist in the current browser')
assert(appSource.includes('resolvePluginNavExpanded'), 'Plugin navigation must use the default-expanded persistence helper')
assert(appSource.includes('min-w-0 flex-1 overflow-auto overflow-x-hidden'), 'Plugin routes must not widen the mobile dashboard viewport')
assert(pluginPageSource.includes('max-w-2xl break-words text-sm leading-5'), 'Plugin descriptions must wrap into a readable multi-line measure')
assert(pluginPageSource.includes("localStorage.setItem(`clawmax-plugin-view-mode:${plugin.slug}`"), 'Plugin view selection must persist like core tabs')
assert(pluginPageSource.includes('history: []'), 'Suggested guardrails must normalize persistence-only history before preview')
assert(pluginPageSource.includes('runs: []'), 'Suggested evals must normalize persistence-only runs before preview')
assert(pluginPageSource.includes('fields: base.fields || {}'), 'Suggested generic plugins must normalize declarative fields before preview')
assert(pluginPageSource.includes('min-w-0 w-full sm:w-auto'), 'Plugin headers must stack without clipping on phone viewports')
assert(pluginPageSource.includes('grid w-full min-w-0 grid-cols-4 overflow-hidden rounded-lg border'), 'Plugin view controls must occupy four stable mobile columns')
assert(manifests.every((manifest) => !/dormant|test plugin|mvp/i.test(`${manifest.name} ${manifest.description} ${manifest.version}`)), 'Enabled plugin UI copy must be product-ready')
assert(new Set(manifests.map((manifest) => manifest.icon)).size === manifests.length, 'Each first-party plugin must declare a distinct navigation icon')

console.log('PluginWorkspaceLayout.test.ts: 35 tests passed')
