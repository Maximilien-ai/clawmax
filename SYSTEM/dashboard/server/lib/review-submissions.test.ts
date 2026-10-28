import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { randomUUID } from 'crypto'
import { queueReviewSubmission, readReviewSubmission, listReviewSubmissions } from './review-submissions'
async function run() {
 const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-review-submit-'))
 const input = { id: randomUUID(), release: 'rc95', recipient: 'review@example.com', reviewer: 'Tester', consent: true, report: '# Review\nPassed P10\napi_key=secret-value\nBearer synthetic-token' }
 const jobs: Array<() => void> = []; let sends = 0
 const options = { apiKey: 'synthetic-only', schedule: (job: () => void) => jobs.push(job), send: async (body: any) => {
  sends++; assert.equal(body.to, input.recipient); assert(!body.text.includes('secret-value')); assert(!body.text.includes('synthetic-token')); assert.equal(Buffer.from(body.attachments[0].content,'base64').toString(),body.text); return { id: 'provider-fixture', message: 'accepted' }
 } }
 try {
  assert.throws(() => queueReviewSubmission(workspace, { ...input, consent: false }, options), /Confirm/)
  assert.throws(() => queueReviewSubmission(workspace, { ...input, recipient: 'bad' }, options), /valid recipient/)
  // The address pattern backtracks quadratically, so a request-sized recipient must fail on length first.
  const started = performance.now()
  assert.throws(() => queueReviewSubmission(workspace, { ...input, recipient: `!@!.${'!.'.repeat(49000)}@` }, options), /valid recipient/)
  assert(performance.now() - started < 250, 'an oversized recipient must be rejected before the address pattern runs')
  assert.throws(() => queueReviewSubmission(workspace, { ...input, id: '../escape' }, options), /Invalid/)
  const queued = queueReviewSubmission(workspace, input, options)
  assert.equal(queued.status, 'queued'); assert.equal(sends, 0)
  assert(!JSON.stringify(readReviewSubmission(workspace, queued.id)).includes('secret-value'))
  queueReviewSubmission(workspace, input, options); assert.equal(jobs.length, 1, 'repeat submission must not duplicate delivery')
  assert.throws(() => queueReviewSubmission(workspace, { ...input, recipient: 'different@example.com' }, options), /different report/)
  jobs.shift()!(); await new Promise(resolve => setImmediate(resolve))
  assert.equal(readReviewSubmission(workspace, queued.id).status, 'accepted'); assert.equal(sends, 1)
  const uncertain = queueReviewSubmission(workspace, { ...input, id: randomUUID() }, { ...options, send: async () => { throw new Error('provider timeout with private data') } })
  jobs.shift()!(); await new Promise(resolve => setImmediate(resolve))
  const saved = readReviewSubmission(workspace, uncertain.id)
  assert.equal(saved.status, 'unknown'); assert(!saved.error?.includes('private data')); assert(saved.report)
  const file = path.join(workspace, 'SYSTEM', 'review-submissions', `${queued.id}.json`)
  fs.writeFileSync(file, JSON.stringify({ ...queued, status: 'sending' }))
  assert.equal(readReviewSubmission(workspace, queued.id).status, 'unknown', 'interrupted delivery must never silently resend')
  assert.equal(listReviewSubmissions(workspace).length, 2)
  console.log('PASS review submission consent, validation, redaction before storage, async delivery, duplicate prevention, report retention and interrupted-delivery handling')
 } finally { fs.rmSync(workspace, { recursive: true, force: true }) }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
