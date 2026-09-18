import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { RecoveryServingGate, recoveryRequestGate } from './recovery-serving-gate'
import { TemplateRecoveryWorker } from './template-recovery-worker'
import os from 'os'

let readable = false
let checks = 0
let starts = 0
const gate = new RecoveryServingGate(() => { checks++; if (!readable) throw new Error('Private store detail') }, () => { starts++ })
assert.throws(() => gate.resume(), /Private/)
gate.onListening()
assert(!gate.ready)
assert.equal(starts, 0)
assert.throws(() => gate.resume(), /Private/)
readable = true
gate.resume(); gate.resume(); gate.onListening()
assert(gate.ready)
assert.equal(starts, 1)
assert.equal(checks, 3)
gate.stop(); gate.resume(); gate.onListening()
assert(!gate.ready)
assert.equal(starts, 1)

let earlyStarts = 0
const early = new RecoveryServingGate(() => {}, () => { earlyStarts++ })
early.resume()
assert.equal(earlyStarts, 0, 'Services wait for the HTTP listener')
early.stop(); early.onListening()
assert.equal(earlyStarts, 0, 'Shutdown cannot resume services')

let ready = false
const middleware = recoveryRequestGate(() => ready)
function request(method: string, requestPath: string) {
  let passed = false
  let status = 200
  let body: any
  const headers: Record<string, string> = {}
  const res: any = { setHeader: (name: string, value: string) => { headers[name] = value }, status: (code: number) => { status = code; return res }, json: (value: unknown) => { body = value } }
  middleware({ method, path: requestPath } as any, res, () => { passed = true })
  return { passed, status, body, headers }
}
for (const route of ['/health', '/health/live', '/recovery']) {
  for (const method of ['GET', 'HEAD']) assert(request(method, route).passed)
  assert.equal(request('POST', route).status, 503)
}
for (const route of ['/agents', '/auth/config', '/auth/verify', '/runtime/skill-broker', '/runtime/mail', '/cli/v1/workspaces', '/workspaces/active', '/system', '/health/extra', '/recovery/extra', '/%68ealth']) {
  for (const method of ['GET', 'POST', 'DELETE', 'OPTIONS']) {
    const result = request(method, route)
    assert(!result.passed)
    assert.equal(result.status, 503)
    assert.equal(result.body.error.code, 'workspace_recovery_required')
    assert.equal(result.body.error.retryable, true)
    assert.match(result.body.requestId, /^req_[a-f0-9-]+$/)
    assert.equal(result.headers['Cache-Control'], 'no-store')
    assert.equal(result.headers['Retry-After'], '30')
    assert(!JSON.stringify(result).includes('Private'))
  }
}
ready = true
assert(request('POST', '/workflows').passed)
assert(request('GET', '/auth/config').passed)

const server = fs.readFileSync(path.join(__dirname, '../index.ts'), 'utf8')
const admission = server.indexOf("app.use('/api', recoveryRequestGate(")
for (const route of ["app.use('/api', auditLog)", "app.use('/api/cli/v1',", "app.use('/api/runtime/skill-broker',", "app.use('/api/auth', createAuthRouter())"]) {
  assert(admission >= 0 && admission < server.indexOf(route), `Recovery admission must precede ${route}`)
}
assert(server.indexOf("app.get('/api/health',") < server.indexOf("app.use('/api', auditLog)"))
async function testRetryTransition() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-serving-gate-'))
  try {
    let callback!: () => Promise<void>
    let readable = false
    let services = 0
    const gate = new RecoveryServingGate(() => { if (!readable) throw new Error('Stores still unreadable') }, () => { services++ })
    gate.onListening()
    const worker = new TemplateRecoveryWorker([{ id: 'active', path: root }], async () => gate.resume(), {
      now: () => 0,
      schedule(task) { callback = task; return () => {} },
    })
    worker.start()
    await callback()
    assert(!gate.ready)
    assert.equal(worker.diagnostics().pendingWorkspaces, 1, 'Recovered journals alone cannot bypass failed store readiness')
    assert.equal(services, 0)
    readable = true
    await callback()
    assert(gate.ready)
    assert.equal(worker.diagnostics().pendingWorkspaces, 0)
    assert.equal(services, 1)
    gate.resume()
    assert.equal(services, 1)
    worker.stop(); gate.stop()
    console.log('recovery-serving-gate.test.ts: passed')
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
}
testRetryTransition().catch(error => { console.error(error); process.exitCode = 1 })
