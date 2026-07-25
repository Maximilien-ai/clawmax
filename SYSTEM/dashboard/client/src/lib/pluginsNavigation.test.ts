import assert from 'assert'
import { resolvePluginNavExpanded } from './plugins'

assert.equal(resolvePluginNavExpanded(null), true, 'Plugin navigation should default expanded')
assert.equal(resolvePluginNavExpanded('true'), true, 'Saved expanded state should remain expanded')
assert.equal(resolvePluginNavExpanded('false'), false, 'Saved collapsed state should remain collapsed')
assert.equal(resolvePluginNavExpanded('invalid'), false, 'Unexpected saved values should not override a deliberate collapsed state')

console.log('pluginsNavigation.test.ts: 4 tests passed')
