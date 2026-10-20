import assert from 'node:assert/strict'
import { isRejectedGatewayChat, recoverRejectedGatewayChat } from './gateway-chat-recovery'
const rejected = { exitCode: 1, rawError: 'Error: Gateway request entry is closed', completionText: '', hadVisibleOutput: false, persistedAssistant: null }
async function main() {
  assert(isRejectedGatewayChat(rejected))
  for (const extra of [
    { exitCode: 0 }, { exitCode: null }, { rawError: 'Gateway connection closed' },
    { rawError: 'timeout' }, { rawError: `${rejected.rawError}\nagent already started` },
    { completionText: 'reply' }, { hadVisibleOutput: true },
    { persistedAssistant: { content: 'saved reply' } }, { incompleteReason: 'cancelled' },
  ]) assert(!isRejectedGatewayChat({ ...rejected, ...extra }))
  let retries = 0
  let checks = 0
  const controller = new AbortController()
  const options = {
    usedGateway: true, signal: controller.signal,
    waitUntilReady: async () => true,
    assertCurrentAuthority: () => { checks++ },
    retry: async () => { retries++; return rejected },
  }
  assert.equal(await recoverRejectedGatewayChat(rejected, options), rejected)
  assert.equal(retries, 1, 'a second rejection must not loop')
  assert.equal(checks, 1)
  await recoverRejectedGatewayChat(rejected, { ...options, usedGateway: false })
  await recoverRejectedGatewayChat(rejected, { ...options, waitUntilReady: async () => false })
  assert.equal(retries, 1)
  await assert.rejects(recoverRejectedGatewayChat(rejected, { ...options, assertCurrentAuthority: () => { throw new Error('revoked or recreated') } }), /revoked/)
  assert.equal(retries, 1)
  await recoverRejectedGatewayChat(rejected, { ...options, waitUntilReady: async () => { controller.abort(); return true } })
  await recoverRejectedGatewayChat(rejected, options)
  assert.equal(retries, 1, 'cancelled turns cannot be resubmitted')
  console.log('Gateway chat admission recovery tests passed')
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
