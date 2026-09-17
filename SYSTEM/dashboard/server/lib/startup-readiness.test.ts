import assert from 'assert'
import { createGatewayReadinessCheck, createHealthHandler, verifyCorePersistentStateReadable } from './startup-readiness'

const result = verifyCorePersistentStateReadable([
  { name: 'agents', read: () => [{ id: 'agent-a' }] },
  { name: 'templates', read: () => [{ slug: 'custom-template' }, { slug: 'organization-template' }] },
  { name: 'groups', read: () => [] },
  { name: 'workflows', read: () => ({ scheduled: true }) },
])

assert.strictEqual(result.ready, true)
assert.deepStrictEqual(result.stores, { agents: 1, templates: 2, groups: 0, workflows: 1 })
assert(Number.isFinite(Date.parse(result.checkedAt)), 'Expected a valid readiness timestamp')

assert.throws(() => verifyCorePersistentStateReadable([
  { name: 'agents', read: () => [] },
  { name: 'templates', read: () => { throw new Error('ENOSPC') } },
  { name: 'workflows', read: () => [] },
]), /Required persistent store "templates" is unreadable: ENOSPC/)

async function checkRuntimeHealth() {
  let clock = 0
  let calls = 0
  let running = true
  let rejectProbe = false
  const check = createGatewayReadinessCheck(async () => {
    calls++
    if (rejectProbe) throw new Error('private gateway connection details')
    return { running }
  }, () => clock)
  assert.deepStrictEqual(await Promise.all([check(), check(), check()]), [true, true, true])
  assert.strictEqual(calls, 1, 'Concurrent checks share one probe')
  running = false
  assert.strictEqual(await check(), true, 'Probe result is briefly cached')
  clock = 1000
  assert.strictEqual(await check(), false, 'Gateway loss invalidates health after cache expiry')
  assert.strictEqual(calls, 2)
  clock = 2000
  rejectProbe = true
  assert.strictEqual(await check(), false, 'Probe failures fail closed')
  clock = 3000
  rejectProbe = false
  running = true
  assert.strictEqual(await check(), true, 'Recovery is observable without restarting Dashboard')

  for (const scenario of [
    { startup: null, required: true, ready: true, status: 503, probes: 0 },
    { startup: result, required: true, ready: true, status: 200, probes: 1 },
    { startup: result, required: true, ready: false, status: 503, probes: 1 },
    { startup: result, required: false, ready: false, status: 200, probes: 0 },
    { startup: result, required: true, ready: false, status: 503, probes: 1, throws: true },
  ]) {
    let status = 0
    let body: any
    let probes = 0
    await createHealthHandler({
      getStartupReadiness: () => scenario.startup,
      workspace: '/synthetic',
      gatewayRequired: () => scenario.required,
      gatewayReady: async () => {
        probes++
        if (scenario.throws) throw new Error('private gateway connection details')
        return scenario.ready
      },
    })(null, { status: code => { status = code }, json: value => { body = value } })
    assert.strictEqual(status, scenario.status)
    assert.strictEqual(probes, scenario.probes)
    assert.strictEqual(body.ok, status === 200)
    assert(!JSON.stringify(body).includes('private gateway'))
    if (scenario.startup) {
      assert.deepStrictEqual(body.readiness.stores, result.stores)
      assert.strictEqual(body.readiness.ready, status === 200)
      assert.deepStrictEqual(body.readiness.gateway, {
        required: scenario.required, ready: scenario.required ? scenario.ready : null,
      })
    }
  }
  console.log('startup-readiness.test.ts: 15 tests passed')
}

checkRuntimeHealth().catch(error => { console.error(error); process.exitCode = 1 })
