import assert from 'assert'
import { devWorkflowErrorMessage, readDevWorkflowResponse } from './devWorkflowResponse'

async function main() {
  await assert.rejects(readDevWorkflowResponse(new Response('', { status: 202 })), /Check Executions before retrying/)
  await assert.rejects(readDevWorkflowResponse(new Response('<html>proxy failure</html>', { status: 502 })), /HTTP 502/)
  assert.deepEqual(await readDevWorkflowResponse(new Response('{"runId":"run-1","status":"running"}', { status: 202 })),
    { runId: 'run-1', status: 'running' })
  assert.match(devWorkflowErrorMessage(new TypeError('Failed to fetch')), /Check Executions before retrying/)
  assert.equal(devWorkflowErrorMessage(new Error('Dev Workflow failed')), 'Dev Workflow failed')
}

main().then(() => console.log('devWorkflowResponse.test.ts: passed')).catch(error => { console.error(error); process.exitCode = 1 })
