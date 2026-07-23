import assert from 'assert'
import { emptyPluginRelationships, fetchPluginRelationships } from './pluginRelationships'

async function run() {
  assert.deepStrictEqual(emptyPluginRelationships(), { agents: {}, workflows: {} })

  const originalFetch = global.fetch
  try {
    global.fetch = (async () => ({
      ok: true,
      json: async () => ({
        agents: { analyst: [{ pluginId: 'guardrails', itemId: 'g1', name: 'No send' }] },
        workflows: { sweep: [{ pluginId: 'guardrails', itemId: 'g1', name: 'No send' }] },
      }),
    })) as any
    const relationships = await fetchPluginRelationships()
    assert.strictEqual(relationships.agents.analyst[0].name, 'No send')
    assert.strictEqual(relationships.workflows.sweep[0].itemId, 'g1')

    global.fetch = (async () => ({ ok: false })) as any
    assert.deepStrictEqual(await fetchPluginRelationships(), { agents: {}, workflows: {} })
  } finally {
    global.fetch = originalFetch
  }

  console.log('pluginRelationships.test.ts: 4 tests passed')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
