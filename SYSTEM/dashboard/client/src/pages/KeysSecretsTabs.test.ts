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
assert(source.includes('cannot be referenced by name in agent chat'), 'browser-local vault should explicitly explain the agent boundary')
assert(source.includes('Storing a Gmail password here does not grant mailbox access'), 'Gmail credentials should not imply mailbox capability')
assert(source.includes("setActiveTab('access')"), 'browser-local guidance should link to agent and skill access')
assert(source.includes("detail: { page: 'skills' }"), 'browser-local guidance should link to skill discovery')

console.log('KeysSecretsTabs.test.ts: 14 assertions passed')
