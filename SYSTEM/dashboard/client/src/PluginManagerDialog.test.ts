import fs from 'fs'
import path from 'path'
import assert from 'assert'

const source = fs.readFileSync(path.join(__dirname, 'components', 'PluginManagerDialog.tsx'), 'utf-8')
const appSource = fs.readFileSync(path.join(__dirname, 'App.tsx'), 'utf-8')
const pageSource = fs.readFileSync(path.join(__dirname, 'pages', 'SystemPlugins.tsx'), 'utf-8')
const logsSource = fs.readFileSync(path.join(__dirname, 'pages', 'Logs.tsx'), 'utf-8')

assert(source.includes("fetch('/api/plugins/settings')"), 'manager should load the discovered plugin inventory')
assert(source.includes("method: 'PUT'"), 'manager should persist plugin enablement')
assert(source.includes('type="checkbox"'), 'manager should expose checkbox controls')
assert(source.includes('embedded ? EmbeddedPluginManager : MobileSafeDialog'), 'manager supports inline and responsive dialog presentation')
assert(source.includes("plugin.visibility"), 'manager should identify public and private plugins')
assert(appSource.includes('aria-label="Manage plugins"'), 'plugin navigation should expose a manager button')
assert(appSource.includes('<SystemPlugins onSaved={setPlugins}'), 'App should mount system plugin management and refresh enabled extensions')
assert(pageSource.includes('<PluginManagerDialog open embedded'), 'ClawMax management is inline')
assert(pageSource.includes('OpenClaw Plugins') && pageSource.includes('ClawMax Plugins and Extensions'), 'tabs distinguish both plugin systems')
assert(pageSource.includes('extend the OpenClaw agent runtime') && pageSource.includes('extend the ClawMax dashboard'), 'scope explanations must stay explicit')
assert(!logsSource.includes('OpenClawPlugins'), 'Logs must not own plugin management')
assert(appSource.includes('>Extensions</span>'), 'sidebar calls dashboard features Extensions')
assert(appSource.includes("'/system/plugins#clawmax'"), 'management shortcut deep-links to ClawMax')
assert(pageSource.includes("addEventListener('hashchange'") && pageSource.includes("addEventListener('popstate'"), 'tab follows direct links and history')
assert(source.includes('disabled={!loaded || loading || saving}'), 'failed inventory must not permit accidental empty saves')
assert(source.includes('role="status"') && source.includes('role="alert"'), 'save success and failure remain visible')
assert(source.includes('sticky bottom-0') && pageSource.includes('flex flex-wrap'), 'actions and long tab names support mobile layouts')

console.log('✓ Plugin manager UI contract tests (17 tests)')
