import assert from 'assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { ensureClearKeeper, inspectClearKeeper, KEEPER_ID } from './workspace-clear-keeper'

async function main() {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'clear-keeper-')))
  try {
    const state = path.join(base, 'state'), personal = path.join(base, 'personal')
    fs.mkdirSync(state)
    const config: any = { agents: { ownership: 'explicit', entries: { sample: { workspace: personal } }, defaults: { model: 'fixture' } }, credential: 'unchanged' }
    const inspect = () => inspectClearKeeper(state, config, [personal])
    const plan = inspect()
    const { GatewayRPCClient } = require('./gateway-rpc')
    let patchCalls = 0
    const client = Object.create(GatewayRPCClient.prototype)
    client.callConfig = async (method: string, params: any) => {
      patchCalls++
      assert.equal(method, 'config.patch')
      assert.equal(params.baseHash, 'r1')
      assert.deepEqual(JSON.parse(params.raw), { agents: { entries: { [KEEPER_ID]: plan.entry } } })
    }
    await assert.rejects(client.createWorkspaceClearKeeper(plan.entry, ''))
    assert.equal(patchCalls, 0)
    await client.createWorkspaceClearKeeper(plan.entry, 'r1')
    assert.equal(patchCalls, 1)
    assert(!fs.existsSync(plan.directory))
    config.agents.entries[KEEPER_ID] = plan.entry
    assert.throws(inspect, /ownership/)
    delete config.agents.entries[KEEPER_ID]
    fs.symlinkSync(personal, plan.directory)
    assert.throws(inspect, /ownership/)
    fs.unlinkSync(plan.directory)
    assert.throws(() => inspectClearKeeper(state, config, [base]), /ownership/)
    config.agents.ownership = undefined
    assert.throws(inspect, /ownership/)
    config.agents.ownership = 'explicit'
    let calls = 0
    const options = { state, workspaceRoots: [personal], readConfig: () => config, revision: async () => 'r1',
      create: async (entry: Record<string, unknown>, revision: string) => {
        assert.equal(revision, 'r1'); calls++
        config.agents.entries[KEEPER_ID] = entry
        throw new Error('ambiguous response after commit')
      } }
    await assert.rejects(ensureClearKeeper(options), /ambiguous/)
    await ensureClearKeeper(options)
    assert.equal(calls, 1)
    assert.equal(config.credential, 'unchanged')
    assert.deepEqual(config.agents.defaults, { model: 'fixture' })
    assert.deepEqual(config.agents.entries.sample, { workspace: personal })
    assert.deepEqual(config.agents.entries[KEEPER_ID].tools, { deny: ['*'] })
    assert.deepEqual(config.agents.entries[KEEPER_ID].heartbeat, { every: '0m' })
    config.agents.entries[KEEPER_ID].workspace = personal
    assert.throws(inspect, /ownership/)
    delete config.agents.entries[KEEPER_ID]
    await assert.rejects(ensureClearKeeper({ ...options, create: async () => {} }), /not verified/)
    console.log('Runtime keeper tests passed: nonmutating preview, collision, links, scope, explicit ownership, ambiguous retry, preservation, verification')
  } finally { fs.rmSync(base, { recursive: true, force: true }) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
