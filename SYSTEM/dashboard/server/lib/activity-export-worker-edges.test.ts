import assert from 'assert'

const activityExportPath = require.resolve('./activity-export')
const integrationsPath = require.resolve('./workspace-integrations')
const workerPath = require.resolve('./activity-export-worker')
const activityExport = require(activityExportPath)
const integrations = require(integrationsPath)

const originals = {
  listAllActivityExportOutbox: activityExport.listAllActivityExportOutbox,
  flushActivityExportOutbox: activityExport.flushActivityExportOutbox,
  setActivityExportQueueListener: activityExport.setActivityExportQueueListener,
  getResolvedWorkspaceIntegrationConfig: integrations.getResolvedWorkspaceIntegrationConfig,
  readWorkspaceIntegrationSecrets: integrations.readWorkspaceIntegrationSecrets,
  endpoint: process.env.CLAWMAX_ACTIVITY_EXPORT_ENDPOINT,
  token: process.env.CLAWMAX_ACTIVITY_EXPORT_TOKEN,
  interval: process.env.CLAWMAX_ACTIVITY_EXPORT_INTERVAL_MS,
  setInterval: global.setInterval,
  clearInterval: global.clearInterval,
}

let outbox: Array<{ destinationId: string }> = []
let flushImpl: (options: any) => Promise<any> = async () => ({ attempted: 0, delivered: 0, remaining: 0 })
let integrationConfig: any = {}
let integrationSecrets: any = {}
let queueListener: (() => void) | null = null

activityExport.listAllActivityExportOutbox = () => outbox
activityExport.flushActivityExportOutbox = (options: any) => flushImpl(options)
activityExport.setActivityExportQueueListener = (listener: (() => void) | null) => { queueListener = listener }
integrations.getResolvedWorkspaceIntegrationConfig = () => integrationConfig
integrations.readWorkspaceIntegrationSecrets = () => integrationSecrets
delete require.cache[workerPath]
const worker = require(workerPath) as typeof import('./activity-export-worker')

let passed = 0
async function test(name: string, fn: () => void | Promise<void>) {
  await fn()
  passed++
  console.log(`✓ ${name}`)
}

const tick = () => new Promise((resolve) => setImmediate(resolve))

void (async () => {
  await test('worker interval accepts bounded configuration and rejects invalid values', () => {
    delete process.env.CLAWMAX_ACTIVITY_EXPORT_INTERVAL_MS
    assert.strictEqual(worker.getActivityExportWorkerStatus().intervalMs, 300000)
    process.env.CLAWMAX_ACTIVITY_EXPORT_INTERVAL_MS = '999'
    assert.strictEqual(worker.getActivityExportWorkerStatus().intervalMs, 300000)
    process.env.CLAWMAX_ACTIVITY_EXPORT_INTERVAL_MS = '2500'
    assert.strictEqual(worker.getActivityExportWorkerStatus().intervalMs, 2500)
  })

  await test('worker skips unknown and unconfigured destinations', async () => {
    outbox = [{ destinationId: 'unknown' }, { destinationId: 'clawmax-ai' }, { destinationId: 'digo' }]
    delete process.env.CLAWMAX_ACTIVITY_EXPORT_ENDPOINT
    delete process.env.CLAWMAX_ACTIVITY_EXPORT_TOKEN
    integrationConfig = { partners: { digo: { apiUrl: 'http://insecure.example' } } }
    integrationSecrets = { partners: { digo: { apiKey: 'key' } } }
    assert.strictEqual(await worker.flushActivityExportWorker(), null)
  })

  await test('worker serializes concurrent flushes', async () => {
    outbox = [{ destinationId: 'clawmax-ai' }]
    process.env.CLAWMAX_ACTIVITY_EXPORT_ENDPOINT = 'https://receiver.example'
    process.env.CLAWMAX_ACTIVITY_EXPORT_TOKEN = 'token'
    let release!: () => void
    flushImpl = async () => {
      await new Promise<void>((resolve) => { release = resolve })
      return { attempted: 1, delivered: 1, remaining: 0 }
    }
    const first = worker.flushActivityExportWorker()
    assert.strictEqual(await worker.flushActivityExportWorker(), null)
    release()
    assert.deepStrictEqual(await first, { attempted: 1, delivered: 1, remaining: 0 })
  })

  await test('worker combines ClawMax and Digo destination results', async () => {
    outbox = [{ destinationId: 'clawmax-ai' }, { destinationId: 'digo' }, { destinationId: 'digo' }]
    process.env.CLAWMAX_ACTIVITY_EXPORT_ENDPOINT = 'https://clawmax.example'
    process.env.CLAWMAX_ACTIVITY_EXPORT_TOKEN = ' clawmax-token '
    integrationConfig = { partners: { digo: { apiUrl: 'https://digo.example' } } }
    integrationSecrets = { partners: { digo: { apiKey: ' digo-token ' } } }
    const calls: any[] = []
    flushImpl = async (options) => {
      calls.push(options)
      return options.destinationId === 'clawmax-ai'
        ? { attempted: 2, delivered: 1, remaining: 2, error: 'retry one' }
        : { attempted: 2, delivered: 2, remaining: 0 }
    }
    assert.deepStrictEqual(await worker.flushActivityExportWorker(), { attempted: 4, delivered: 3, remaining: 0, error: 'retry one' })
    assert.deepStrictEqual(calls.map((call) => [call.destinationId, call.endpoint, call.token]), [
      ['clawmax-ai', 'https://clawmax.example', 'clawmax-token'],
      ['digo', 'https://digo.example', 'digo-token'],
    ])
    const status = worker.getActivityExportWorkerStatus()
    assert.strictEqual(status.lastResult?.delivered, 3)
    assert.strictEqual(status.lastError, 'retry one')
    assert.deepStrictEqual(status.configured, { clawmaxAi: true, digo: true })
  })

  await test('worker records and rethrows delivery failures', async () => {
    outbox = [{ destinationId: 'clawmax-ai' }]
    flushImpl = async () => { throw new Error('receiver offline') }
    await assert.rejects(() => worker.flushActivityExportWorker(), /receiver offline/)
    assert.strictEqual(worker.getActivityExportWorkerStatus().lastError, 'receiver offline')
    flushImpl = async () => { throw 'plain failure' }
    await assert.rejects(() => worker.flushActivityExportWorker(), (error) => error === 'plain failure')
    assert.strictEqual(worker.getActivityExportWorkerStatus().lastError, 'plain failure')
  })

  await test('start remains disabled without credentials and is idempotent when configured', async () => {
    worker.stopActivityExportWorker()
    delete process.env.CLAWMAX_ACTIVITY_EXPORT_ENDPOINT
    delete process.env.CLAWMAX_ACTIVITY_EXPORT_TOKEN
    integrationConfig = {}
    integrationSecrets = {}
    const logs: string[] = []
    worker.startActivityExportWorker((message) => logs.push(message))
    assert(logs.some((message) => message.includes('worker disabled')))
    assert.strictEqual(worker.getActivityExportWorkerStatus().running, false)

    process.env.CLAWMAX_ACTIVITY_EXPORT_ENDPOINT = 'https://receiver.example'
    process.env.CLAWMAX_ACTIVITY_EXPORT_TOKEN = 'token'
    outbox = []
    flushImpl = async () => ({ attempted: 0, delivered: 0, remaining: 0 })
    let intervalCallback: (() => void) | null = null
    let unrefCalled = false
    let cleared = false
    ;(global as any).setInterval = (callback: () => void, milliseconds: number) => {
      assert.strictEqual(milliseconds, 2500)
      intervalCallback = callback
      return { unref: () => { unrefCalled = true } }
    }
    ;(global as any).clearInterval = () => { cleared = true }
    worker.startActivityExportWorker((message) => logs.push(message))
    worker.startActivityExportWorker((message) => logs.push(message))
    assert.strictEqual(worker.getActivityExportWorkerStatus().running, true)
    assert.strictEqual(unrefCalled, true)
    assert(queueListener)
    ;(intervalCallback as unknown as () => void)()
    queueListener?.()
    await tick()
    assert.strictEqual(logs.filter((message) => message.includes('worker started')).length, 1)
    worker.stopActivityExportWorker()
    assert.strictEqual(cleared, true)
    assert.strictEqual(queueListener, null)
    assert.strictEqual(worker.getActivityExportWorkerStatus().running, false)
    worker.stopActivityExportWorker()
  })

  await test('background flush logs delayed, delivered, and rejected results', async () => {
    const logs: string[] = []
    outbox = [{ destinationId: 'clawmax-ai' }]
    process.env.CLAWMAX_ACTIVITY_EXPORT_ENDPOINT = 'https://receiver.example'
    process.env.CLAWMAX_ACTIVITY_EXPORT_TOKEN = 'token'
    let callback: (() => void) | null = null
    ;(global as any).setInterval = (fn: () => void) => { callback = fn; return { unref() {} } }
    ;(global as any).clearInterval = () => {}
    flushImpl = async () => ({ attempted: 1, delivered: 0, remaining: 1, error: 'later' })
    worker.startActivityExportWorker((message) => logs.push(message))
    await tick()
    assert(logs.some((message) => message.includes('delivery delayed: later')))
    flushImpl = async () => ({ attempted: 1, delivered: 1, remaining: 0 })
    ;(callback as unknown as () => void)()
    await tick()
    assert(logs.some((message) => message.includes('delivered 1 event')))
    flushImpl = async () => { throw new Error('boom') }
    ;(callback as unknown as () => void)()
    await tick()
    assert(logs.some((message) => message.includes('worker failed: boom')))
    worker.stopActivityExportWorker()
  })

  console.log(`activity-export-worker-edges.test.ts: ok (${passed} tests)`)
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
}).finally(() => {
  worker.stopActivityExportWorker()
  activityExport.listAllActivityExportOutbox = originals.listAllActivityExportOutbox
  activityExport.flushActivityExportOutbox = originals.flushActivityExportOutbox
  activityExport.setActivityExportQueueListener = originals.setActivityExportQueueListener
  integrations.getResolvedWorkspaceIntegrationConfig = originals.getResolvedWorkspaceIntegrationConfig
  integrations.readWorkspaceIntegrationSecrets = originals.readWorkspaceIntegrationSecrets
  global.setInterval = originals.setInterval
  global.clearInterval = originals.clearInterval
  if (originals.endpoint === undefined) delete process.env.CLAWMAX_ACTIVITY_EXPORT_ENDPOINT
  else process.env.CLAWMAX_ACTIVITY_EXPORT_ENDPOINT = originals.endpoint
  if (originals.token === undefined) delete process.env.CLAWMAX_ACTIVITY_EXPORT_TOKEN
  else process.env.CLAWMAX_ACTIVITY_EXPORT_TOKEN = originals.token
  if (originals.interval === undefined) delete process.env.CLAWMAX_ACTIVITY_EXPORT_INTERVAL_MS
  else process.env.CLAWMAX_ACTIVITY_EXPORT_INTERVAL_MS = originals.interval
})
