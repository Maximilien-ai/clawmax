import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { normalizeAgentActivityPayload } from './lib/agentActivity'

assert.strictEqual(
  normalizeAgentActivityPayload({ error: 'Agent not found' }),
  null,
  'Agent activity error payloads must not enter component state',
)
assert.deepStrictEqual(
  normalizeAgentActivityPayload({ todos: 'one task' }),
  {
    todos: 'one task',
    recentFiles: [],
    completed: null,
    identity: null,
    skills: undefined,
  },
  'Partial activity payloads must receive render-safe collection defaults',
)

const componentDir = path.join(__dirname, 'components')
const detailSource = fs.readFileSync(path.join(componentDir, 'AgentDetailPanel.tsx'), 'utf8')
assert(
  detailSource.includes('r.ok ? normalizeAgentActivityPayload'),
  'Agent details must reject non-OK activity responses at the fetch boundary',
)
assert(
  detailSource.includes('(activity.recentFiles || []).map'),
  'Agent details must retain a defensive recent-files render guard',
)

const modelFitSource = fs.readFileSync(path.join(componentDir, 'ModelFitRecommendationPanel.tsx'), 'utf8')
assert(
  modelFitSource.includes('const primaryCandidate = recommendation?.candidates?.[0]'),
  'Model fit details must resolve the optional primary candidate safely',
)
assert(
  !modelFitSource.includes('recommendation.candidates[0]'),
  'Model fit rendering must not index an absent candidate before checking it',
)

console.log('DashboardPayloadSafety.test.ts: 6 assertions passed')
