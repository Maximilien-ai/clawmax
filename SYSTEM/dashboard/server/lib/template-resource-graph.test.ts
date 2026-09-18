import assert from 'assert'
import { templateFixture } from './portable-template.test'
import { validatePortableTemplate } from './portable-template'
import { compileTemplateResourceGraph } from './template-resource-graph'

async function main() {
  const bundle = await validatePortableTemplate(await templateFixture())
  const before = structuredClone(bundle)
  const prefix = 'tr-0123456789abcdef'
  const graph = compileTemplateResourceGraph(bundle, prefix)
  assert.deepEqual(bundle, before, 'Compilation must not mutate validated input')
  assert.deepEqual(graph, compileTemplateResourceGraph(bundle, prefix), 'Planning must be deterministic')
  assert.equal(graph.agents.length, 2)
  assert.equal(graph.groups.length, 1)
  assert.equal(graph.workflows.length, 1)
  assert(graph.agents.every(agent => agent.admission === 'pending-authority'))
  assert.equal(graph.agents[0].requestedModel, 'openai-compatible/qwen')
  assert.equal(graph.groups[0].state, 'stopped')
  assert.equal(graph.workflows[0].enabled, false)
  assert.equal(graph.groups[0].members[0].agentId, graph.resources.agents.producer)
  assert.deepEqual(graph.groups[0].entryMemberIds, ['producer'])
  assert.deepEqual(graph.groups[0].members[0].sendTo, ['reviewer'])
  assert.deepEqual(graph.groups[0].members[1].sendTo, ['producer'])
  assert.equal(graph.workflows[0].steps[0].targetId, graph.resources.groups.review)
  assert.equal(Object.keys(graph.resources.communities).length, 0)
  const separate = compileTemplateResourceGraph(bundle, 'tr-fedcba9876543210')
  assert.notEqual(separate.agents[0].id, graph.agents[0].id, 'Revisions must not share resource IDs')
  assert.throws(() => compileTemplateResourceGraph(bundle, '../escape'), /namespace/)
  const ambiguous = structuredClone(bundle)
  ambiguous.artifacts.push({ ...ambiguous.artifacts[0], id: 'duplicate' })
  assert.throws(() => compileTemplateResourceGraph(ambiguous, prefix), /ambiguous/)
  const missing = structuredClone(bundle)
  missing.artifacts = missing.artifacts.filter(item => item.id !== 'producer')
  assert.throws(() => compileTemplateResourceGraph(missing, prefix), /target is missing/)

  // Exercise graph semantics independently of ZIP admission: both success and
  // failure edges, handoff types, managed ownership, and workflow dependencies.
  const complex = structuredClone(bundle)
  const workflow = complex.artifacts.find(item => item.kind === 'workflow')!
  const agent = complex.artifacts.find(item => item.kind === 'agent')!
  workflow.definition.steps.push({ id: 'follow-up', targetKind: 'agent', targetDigest: agent.digest, objective: 'Follow up' })
  workflow.definition.steps.push({ id: 'recover', targetKind: 'agent', targetDigest: agent.digest, objective: 'Recover' })
  workflow.definition.edges = [
    { from: 'check', to: 'follow-up', condition: 'success', handoff: 'structured-output' },
    { from: 'check', to: 'recover', condition: 'failure', handoff: 'evidence-reference' },
  ]
  workflow.definition.execution = { mode: 'managed', ownerStepId: 'check' }
  workflow.definition.schedule = { type: 'cron', cron: '0 9 * * *', timeZone: 'America/Los_Angeles' }
  const dependent = structuredClone(workflow)
  dependent.id = 'downstream'; dependent.digest = `sha256:${'f'.repeat(64)}`
  dependent.definition.runPolicy = { type: 'conditional', maxRuns: 3, dependsOn: [workflow.digest] }
  complex.artifacts.push(dependent)
  const result = compileTemplateResourceGraph(complex, prefix)
  assert.deepEqual(result.workflows[0].edges, workflow.definition.edges)
  assert.deepEqual(result.workflows[0].execution, workflow.definition.execution)
  assert.deepEqual(result.workflows[0].schedule, workflow.definition.schedule)
  assert(result.workflows.every(item => !item.enabled))
  assert.deepEqual(result.workflows[1].runPolicy.dependsOn, [result.resources.workflows.check])
  assert.equal(result.workflows[0].steps[1].targetId, result.resources.agents.producer)
  result.groups[0].members[0].sendTo.length = 0
  result.workflows[0].edges.length = 0
  assert.equal(complex.artifacts.find(item => item.kind === 'group')!.definition.members[0].sendTo.length, 1)
  assert.equal(workflow.definition.edges.length, 2, 'Compiled output must not alias input graph')
  console.log('template-resource-graph.test.ts: passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
