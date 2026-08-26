import assert from 'assert'
import { emptyPluginRelationships, fetchPluginRelationships, groupPluginRelationships, summarizePluginRelationships, type PluginRelationship } from './pluginRelationships'

const relationshipFixtures: PluginRelationship[] = [
  { pluginId: 'guardrails', pluginName: 'Guardrails', objectKind: 'guardrail', itemId: 'g1', name: 'No send', status: 'active' },
  { pluginId: 'evals', pluginName: 'Evals', objectKind: 'eval', itemId: 'e1', name: 'Quality', status: '3 runs' },
  { pluginId: 'optimize', pluginName: 'Optimize', objectKind: 'optimization-plan', itemId: 'o1', name: 'Cost plan', status: 'on-track', summary: 'Within budget.' },
  { pluginId: 'guardrails', pluginName: 'Guardrails', objectKind: 'guardrail', itemId: 'g2', name: 'Approval', status: 'active' },
]

async function run() {
  assert.deepStrictEqual(emptyPluginRelationships(), { agents: {}, workflows: {} })

  const originalFetch = global.fetch
  try {
    global.fetch = (async () => ({
      ok: true,
      json: async () => ({
        agents: { analyst: [relationshipFixtures[0], null, { pluginId: 'incomplete' }] },
        workflows: { sweep: [relationshipFixtures[1], relationshipFixtures[2]] },
      }),
    })) as any
    const relationships = await fetchPluginRelationships()
    assert.strictEqual(relationships.agents.analyst[0].name, 'No send')
    assert.strictEqual(relationships.workflows.sweep[0].itemId, 'e1')
    assert.strictEqual(relationships.workflows.sweep[1].summary, 'Within budget.')

    const groups = groupPluginRelationships(relationshipFixtures)
    assert.deepStrictEqual(groups.map((group) => [group.pluginName, group.count]), [['Evals', 1], ['Guardrails', 2], ['Optimize', 1]])
    const compact = summarizePluginRelationships(relationshipFixtures, 2)
    assert.deepStrictEqual(compact.visible.map((group) => group.pluginName), ['Evals', 'Guardrails'])
    assert.strictEqual(compact.overflowCount, 1)
    assert(compact.title.includes('Optimize: Cost plan'))

    global.fetch = (async () => ({ ok: false })) as any
    assert.deepStrictEqual(await fetchPluginRelationships(), { agents: {}, workflows: {} })
  } finally {
    global.fetch = originalFetch
  }

  console.log('pluginRelationships.test.ts: 10 tests passed')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
