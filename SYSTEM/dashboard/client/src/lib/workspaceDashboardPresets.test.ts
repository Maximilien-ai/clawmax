import assert from 'assert'
import { WORKSPACE_DASHBOARD_PRESETS } from './workspaceDashboardPresets'

for (const [id, preset] of Object.entries(WORKSPACE_DASHBOARD_PRESETS)) {
  assert(preset.title.length > 0, `${id} preset needs a title`)
  assert.strictEqual(new Set(preset.order).size, 9, `${id} preset must order every dashboard section once`)
  assert.strictEqual(preset.order.length, 9, `${id} preset order is incomplete`)
}
assert.strictEqual(WORKSPACE_DASHBOARD_PRESETS.operations.sections.interactions, true)
assert.strictEqual(WORKSPACE_DASHBOARD_PRESETS.costs.sections.costs, true)
assert.strictEqual(WORKSPACE_DASHBOARD_PRESETS.communications.sections.groupChats, true)
console.log('Workspace dashboard preset tests: 6 passed')
