import assert from 'node:assert/strict'
import { parseWorkspaceBudgetLimit, saveWorkspaceBudget } from './workspaceBudget'

async function run() {
  assert.equal(parseWorkspaceBudgetLimit('0'), 0)
  assert.equal(parseWorkspaceBudgetLimit('25.50'), 25.5)
  for (const value of ['', ' ', '-1', 'not-a-number', 'Infinity']) {
    assert.throws(() => parseWorkspaceBudgetLimit(value))
  }

  let called = false
  await saveWorkspaceBudget('workspace-b', '0', false, (async (path, options) => {
    called = true
    assert.match(String(path), /workspaceId=workspace-b/)
    assert.deepEqual(JSON.parse(String(options?.body)), { workspaceId: 'workspace-b', limitUsd: 0, enforced: false })
    return { ok: true } as Response
  }) as typeof fetch)
  assert(called)

  await assert.rejects(saveWorkspaceBudget('workspace-a', '12', true, (async () => ({
    ok: false, json: async () => ({ error: 'Budget write failed' }),
  } as Response)) as typeof fetch), /Budget write failed/)

  console.log('Workspace budget client tests passed (8 assertions)')
}

run().catch(error => { console.error(error); process.exitCode = 1 })
