import assert from 'assert'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.join(process.cwd(), 'client/src/pages/KeysSecrets.tsx'), 'utf8')

assert(source.includes("label: 'Agent & Skill Access'"), 'runtime grants should have a dedicated tab')
assert(source.includes("label: 'Workspace Keys'"), 'workspace browser keys should have a dedicated tab')
assert(source.includes("label: 'Global Keys'"), 'global browser keys should have a dedicated tab')
assert(source.includes("label: 'Partners'"), 'partner-managed credentials should have a dedicated tab')
assert(source.includes('role="tablist"') && source.includes('role="tab"'), 'navigation should use accessible tab semantics')
assert(source.includes('aria-selected={activeTab === tab.id}'), 'the selected tab should be announced')
assert(source.includes('overflow-x-auto border-b'), 'the established border tab bar should scroll on narrow screens')
assert(source.includes("'clawmax.keys-secrets.active-tab'"), 'the selected section should persist across refreshes')
assert(source.includes("activeTab === 'workspace' || activeTab === 'global'"), 'inventory and import tools should remain scoped to browser key tabs')
assert(source.includes('rounded-full px-3 py-1.5'), 'pills should remain available for inventory filtering')

console.log('KeysSecretsTabs.test.ts: 10 assertions passed')
