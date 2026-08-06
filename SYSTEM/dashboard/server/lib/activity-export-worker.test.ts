import assert from 'assert'
import { flushActivityExportWorker, getActivityExportWorkerStatus, startActivityExportWorker, stopActivityExportWorker } from './activity-export-worker'

const endpoint = process.env.CLAWMAX_ACTIVITY_EXPORT_ENDPOINT
const token = process.env.CLAWMAX_ACTIVITY_EXPORT_TOKEN
delete process.env.CLAWMAX_ACTIVITY_EXPORT_ENDPOINT
delete process.env.CLAWMAX_ACTIVITY_EXPORT_TOKEN

;(async () => {
  assert.strictEqual(await flushActivityExportWorker(), null, 'worker must stay disabled without delivery configuration')
  assert.strictEqual(getActivityExportWorkerStatus().running, false, 'worker status must report disabled when credentials are absent')
  startActivityExportWorker(() => {})
  assert.strictEqual(getActivityExportWorkerStatus().running, false, 'worker must not start without credentials')
  stopActivityExportWorker()
  if (endpoint === undefined) delete process.env.CLAWMAX_ACTIVITY_EXPORT_ENDPOINT
  else process.env.CLAWMAX_ACTIVITY_EXPORT_ENDPOINT = endpoint
  if (token === undefined) delete process.env.CLAWMAX_ACTIVITY_EXPORT_TOKEN
  else process.env.CLAWMAX_ACTIVITY_EXPORT_TOKEN = token
  console.log('Activity export worker tests: 2 passed')
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
