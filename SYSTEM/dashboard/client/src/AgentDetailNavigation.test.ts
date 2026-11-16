import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const agents = fs.readFileSync(path.join(__dirname, 'pages/Agents.tsx'), 'utf8')
const app = fs.readFileSync(path.join(__dirname, 'App.tsx'), 'utf8')

assert.match(agents, /if \(isActive === false\) \{\s*setSelectedAgent\(null\)\s*setBudgetEditorAgentId\(null\)/,
  'Leaving Agents closes detail without unmounting the list')
assert.match(agents, /if \(isActive && initialAgentId && agents\.length > 0\)/,
  'An explicit agent link opens only while Agents is active')
assert.match(agents, /setSelectedAgent\(agent\)\s*onInitialAgentHandled\?\.\(\)/,
  'The explicit agent selection is consumed once')
assert.match(app, /onInitialAgentHandled=\{\(\) => setInitialAgentId\(undefined\)\}/,
  'App clears the link after Agents uses it')
assert.match(app, /visitedPages\.has\('agents'\)/,
  'Agents remains mounted so its list and scroll position survive tab changes')

console.log('Agent detail navigation tests passed')
