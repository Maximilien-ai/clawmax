import assert from 'node:assert/strict'
import { parseWorkspaceBudgetLimit, saveWorkspaceBudget } from './workspaceBudget'

let cases = 0
async function check(run: () => void | Promise<void>) { await run(); cases++ }

async function run() {
  await check(() => assert.equal(parseWorkspaceBudgetLimit('0'), 0))
  await check(() => assert.equal(parseWorkspaceBudgetLimit('25.50'), 25.5))
  for (const value of ['', ' ', '-1', 'not-a-number', 'Infinity']) {
    await check(() => assert.throws(() => parseWorkspaceBudgetLimit(value)))
  }

  await check(async () => {
    let called = false
    await saveWorkspaceBudget('workspace-b', '0', false, (async (path, options) => {
    called = true
    assert.match(String(path), /workspaceId=workspace-b/)
    assert.deepEqual(JSON.parse(String(options?.body)), { workspaceId: 'workspace-b', limitUsd: 0, enforced: false })
    return { ok: true } as Response
  }) as typeof fetch)
    assert(called)
  })

  await check(async () => { await assert.rejects(saveWorkspaceBudget('workspace-a', '12', true, (async () => ({
    ok: false, json: async () => ({ error: 'Budget write failed' }),
  } as Response)) as typeof fetch), /Budget write failed/) })

  await check(async () => {
    let called = false
    await assert.rejects(saveWorkspaceBudget('a', '-1', true, (async () => { called = true; throw new Error('Unexpected write') }) as typeof fetch), /non-negative/)
    assert.equal(called, false, 'invalid input must never send a write')
  })
  await check(async () => { await assert.rejects(saveWorkspaceBudget('a', '2', true, (async () => { throw new Error('Network unavailable') }) as typeof fetch), /Network unavailable/) })
  await check(async () => { await assert.rejects(saveWorkspaceBudget('a', '2', true, (async () => ({ ok: false, json: async () => { throw new SyntaxError('HTML response') } } as unknown as Response)) as typeof fetch), /Workspace budget could not be saved/) })
  console.log(`Workspace budget client tests passed (${cases} cases)`)
}

run().catch(error => { console.error(error); process.exitCode = 1 })
