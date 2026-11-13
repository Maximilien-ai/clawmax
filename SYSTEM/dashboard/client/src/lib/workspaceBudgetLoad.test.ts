import assert from 'node:assert/strict'
import { loadWorkspaceBudget } from './workspaceBudget'

let cases = 0
async function check(run: () => void | Promise<void>) { await run(); cases++ }
const snapshot = { enabled: true, config: { limitUsd: 42, enforced: false }, currentSpendUsd: 2, usedPct: 4.76, level: 'ok' }
const reply = (data: unknown) => (async () => ({ ok: true, json: async () => data } as Response)) as typeof fetch

async function run() {
  await check(async () => {
    const controller = new AbortController()
    let called = false
    const loaded = await loadWorkspaceBudget('workspace-b', controller.signal, (async (url, options) => {
      called = true
      assert.match(String(url), /workspaceId=workspace-b/)
      assert.equal(options?.signal, controller.signal)
      return { ok: true, json: async () => snapshot } as Response
    }) as typeof fetch)
    assert(called)
    assert.deepEqual(loaded, snapshot)
  })
  await check(async () => {
    const zero = { ...snapshot, config: { limitUsd: 0, enforced: true }, currentSpendUsd: 0, usedPct: 0 }
    assert.deepEqual(await loadWorkspaceBudget('a', undefined, reply(zero)), zero)
  })
  await check(async () => { assert.deepEqual(await loadWorkspaceBudget('a', undefined, reply({ enabled: false })), { enabled: false }) })
  await check(async () => { await assert.rejects(loadWorkspaceBudget('a', undefined, (async () => ({ ok: false } as Response)) as typeof fetch), /could not be loaded/) })
  await check(async () => { await assert.rejects(loadWorkspaceBudget('a', undefined, (async () => { throw new Error('Network unavailable') }) as typeof fetch), /Network unavailable/) })
  await check(async () => { await assert.rejects(loadWorkspaceBudget('a', undefined, (async () => ({ ok: true, json: async () => { throw new SyntaxError('Invalid JSON') } } as unknown as Response)) as typeof fetch), /Invalid JSON/) })
  await check(async () => {
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(loadWorkspaceBudget('a', controller.signal, (async (_url, options) => {
      assert.equal(options?.signal?.aborted, true)
      throw new DOMException('Cancelled', 'AbortError')
    }) as typeof fetch), { name: 'AbortError' })
  })
  for (const invalid of [
    null, {}, { config: {} },
    { ...snapshot, config: { limitUsd: '42', enforced: false } },
    { ...snapshot, config: { limitUsd: -1, enforced: true } },
    { ...snapshot, config: { limitUsd: Infinity, enforced: true } },
    { ...snapshot, config: { limitUsd: 42, enforced: 'false' } },
    { ...snapshot, currentSpendUsd: null },
    { ...snapshot, currentSpendUsd: Infinity },
    { ...snapshot, usedPct: '4.76' },
    { ...snapshot, usedPct: NaN },
    { ...snapshot, level: 'unknown' },
  ]) {
    await check(async () => { await assert.rejects(loadWorkspaceBudget('a', undefined, reply(invalid)), /incomplete/) })
  }
  console.log(`Workspace budget loading tests passed (${cases} cases)`)
}
run().catch(error => { console.error(error); process.exitCode = 1 })
