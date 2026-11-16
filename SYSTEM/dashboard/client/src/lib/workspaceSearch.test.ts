import assert from 'assert'
import { filterWorkspaces } from './workspaceSearch'

const workspaces = [
  { id: 'default', name: 'Personal' },
  { id: 'maximilien-ai-operations', name: 'Maximilien.ai Operations' },
  { id: 'marketing', name: 'Marketing' },
]
assert.deepEqual(filterWorkspaces(workspaces, ''), workspaces)
assert.deepEqual(filterWorkspaces(workspaces, '  MAXIMILIEN '), [workspaces[1]])
assert.deepEqual(filterWorkspaces(workspaces, 'operations'), [workspaces[1]])
assert.deepEqual(filterWorkspaces(workspaces, 'default'), [workspaces[0]])
assert.deepEqual(filterWorkspaces(workspaces, 'missing'), [])
console.log('workspaceSearch.test.ts: passed')
