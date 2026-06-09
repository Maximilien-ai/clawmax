import { addVisitedPage } from './appNavigationState'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

const initial = new Set(['docs'])
const withAgents = addVisitedPage(initial, 'agents')
assert(withAgents !== initial, 'Expected adding a new page to create a new Set')
assert(withAgents.has('agents'), 'Expected target page to be marked visited before navigation render')
assert(initial.has('agents') === false, 'Expected original visited page Set to remain unchanged')

const unchanged = addVisitedPage(withAgents, 'agents')
assert(unchanged === withAgents, 'Expected existing page to preserve Set identity')

console.log('appNavigationState.test.ts: 4 tests passed')
