import fs from 'fs'
import os from 'os'
import path from 'path'
import assert from 'assert'
import { deliverAvailableBriefs } from './brief-delivery'

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brief-delivery-'))
  const dir = path.join(root, 'SYSTEM/dev-template-workflow-runs')
  fs.mkdirSync(dir, { recursive: true })
  const workflowId = 'tr-1234567890abcdef-workflow-123456789abc'
  const config = { version: 1, enabled: true, recipient: 'owner@example.test', reporterId: 'reporter', enabledAt: '2026-01-01T00:00:00Z', workflowIds: [workflowId] }
  const saveConfig = () => fs.writeFileSync(path.join(root, 'SYSTEM/brief-delivery.json'), JSON.stringify(config))
  saveConfig()
  let sent = 0, body = '', notified = ''
  const deps = { now: Date.parse('2026-01-02T10:02:00Z'), authorize: () => {}, send: async (_c: any, b: string) => { sent++; body = b; return { id: 'provider-1' } }, notify: (r: any) => { notified = r.status } }
  const run = (n: number, status = 'completed') => {
    const runId = `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
    fs.writeFileSync(path.join(dir, `${runId}.json`), JSON.stringify({ runId, workflowId, status, createdAt: '2026-01-02T10:00:00Z', completedAt: '2026-01-02T10:00:30Z', brief: { title: `Brief ${n}`, content: `Findings ${n}` } }))
  }
  try {
    run(1); run(2); run(3, 'failed')
    assert.equal(await deliverAvailableBriefs(root, { ...deps, now: Date.parse('2026-01-02T10:00:40Z') }), null)
    const receipt = await deliverAvailableBriefs(root, deps)
    assert.equal(receipt?.status, 'sent'); assert.equal(receipt?.runIds.length, 2)
    assert(body.includes('Findings 1') && body.includes('Findings 2') && !body.includes('Findings 3'))
    assert.equal(notified, 'sent'); assert.equal(sent, 1)
    assert.equal(await deliverAvailableBriefs(root, deps), null)
    run(4); config.enabled = false; saveConfig()
    assert.equal(await deliverAvailableBriefs(root, deps), null)
    config.enabled = true; saveConfig()
    await assert.rejects(deliverAvailableBriefs(root, { ...deps, authorize: () => { throw Error('revoked') } }))
    const uncertain = await deliverAvailableBriefs(root, { ...deps, send: async () => { throw Error('private provider error') } })
    assert.equal(uncertain?.status, 'uncertain')
    assert.equal(await deliverAvailableBriefs(root, deps), null)
    run(5); run(6, 'running')
    assert.equal(await deliverAvailableBriefs(root, deps), null)
    assert.equal((await deliverAvailableBriefs(root, { ...deps, now: Date.parse('2026-01-02T10:10:00Z') }))?.runIds.length, 1)
    run(7)
    fs.writeFileSync(path.join(root, 'SYSTEM/brief-deliveries/dispatch.lock'), '')
    await assert.rejects(deliverAvailableBriefs(root, { ...deps, now: Date.parse('2026-01-02T10:10:00Z') }), /lock needs review/)
    assert(!fs.readFileSync(path.join(root, 'SYSTEM/brief-deliveries', `${uncertain!.id}.json`), 'utf8').includes('private provider error'))
    console.log('Brief delivery: combined batches, quiet window, failed runs, persistence, opt-out, revocation, uncertain sends, bounded wait and crash lock passed')
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
