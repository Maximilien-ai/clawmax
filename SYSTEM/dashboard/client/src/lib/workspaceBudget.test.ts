import assert from 'node:assert/strict'
import { loadWorkspaceBudget, parseWorkspaceBudgetLimit, saveWorkspaceBudget } from './workspaceBudget'

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

  const snapshot = { enabled: true, config: { limitUsd: 42, enforced: false }, currentSpendUsd: 2, usedPct: 4.76, level: 'ok' }
  const controller = new AbortController()
  const loaded = await loadWorkspaceBudget('workspace-b', controller.signal, (async (path, options) => {
    assert.match(String(path), /workspaceId=workspace-b/)
    assert.equal(options?.signal, controller.signal)
    return { ok: true, json: async () => snapshot } as Response
  }) as typeof fetch)
  assert.deepEqual(loaded, snapshot)
  for (const data of [{}, { config: { limitUsd: '42', enforced: false } }, { ...snapshot, config: { limitUsd: -1, enforced: true } }, { ...snapshot, currentSpendUsd: null }]) {
    await assert.rejects(loadWorkspaceBudget('a', undefined, (async () => ({ ok: true, json: async () => data } as Response)) as typeof fetch), /incomplete/)
  }
  assert.deepEqual(await loadWorkspaceBudget('a', undefined, (async () => ({ ok: true, json: async () => ({ enabled: false }) } as Response)) as typeof fetch), { enabled: false })
  await assert.rejects(loadWorkspaceBudget('a', undefined, (async () => ({ ok: false } as Response)) as typeof fetch), /could not be loaded/)
  await assert.rejects(loadWorkspaceBudget('a', undefined, (async () => { throw new Error('Network unavailable') }) as typeof fetch), /Network unavailable/)
  console.log('Workspace budget client tests passed: parsing, scoped writes, validated reads, disabled feature and failures')
}

run().catch(error => { console.error(error); process.exitCode = 1 })
