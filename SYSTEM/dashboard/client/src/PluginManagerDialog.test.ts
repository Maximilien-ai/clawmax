import fs from 'fs'
import path from 'path'
import assert from 'assert'

const source = fs.readFileSync(path.join(__dirname, 'components', 'PluginManagerDialog.tsx'), 'utf-8')
const appSource = fs.readFileSync(path.join(__dirname, 'App.tsx'), 'utf-8')

assert(source.includes("fetch('/api/plugins/settings')"), 'manager should load the discovered plugin inventory')
assert(source.includes("method: 'PUT'"), 'manager should persist plugin enablement')
assert(source.includes('type="checkbox"'), 'manager should expose checkbox controls')
assert(source.includes('<MobileSafeDialog'), 'manager should use the shared responsive dialog')
assert(source.includes("plugin.visibility"), 'manager should identify public and private plugins')
assert(appSource.includes('aria-label="Manage plugins"'), 'plugin navigation should expose a manager button')
assert(appSource.includes('<PluginManagerDialog'), 'App should mount the plugin manager')

console.log('✓ Plugin manager UI contract tests (7 tests)')
