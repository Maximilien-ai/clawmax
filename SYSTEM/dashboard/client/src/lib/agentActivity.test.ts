import assert from 'node:assert/strict'
import { normalizeAgentActivity } from './agentActivity'

assert.equal(normalizeAgentActivity({ error: 'Agent not found' }), null)
assert.equal(normalizeAgentActivity(null), null)

assert.deepEqual(normalizeAgentActivity({}), {
  recentFiles: [],
  todos: null,
  completed: null,
  identity: null,
  skills: [],
  liveConfig: undefined,
})

assert.deepEqual(normalizeAgentActivity({
  recentFiles: [
    { name: 'IDENTITY.md', mtime: '2026-10-15T12:00:00.000Z', ageMins: 0.5 },
    { name: 'invalid' },
  ],
  skills: ['web-search', null, 42],
  liveConfig: {
    model: 'anthropic/claude-haiku-4-5',
    workspace: '/tmp/workspace',
    agentDir: '/tmp/agent',
  },
}), {
  recentFiles: [{ name: 'IDENTITY.md', mtime: '2026-10-15T12:00:00.000Z', ageMins: 0.5 }],
  todos: null,
  completed: null,
  identity: null,
  skills: ['web-search'],
  liveConfig: {
    model: 'anthropic/claude-haiku-4-5',
    workspace: '/tmp/workspace',
    agentDir: '/tmp/agent',
  },
})

console.log('agentActivity.test.ts: 4 tests passed')
