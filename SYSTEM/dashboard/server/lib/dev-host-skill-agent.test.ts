import assert from 'assert'
import { runDevHostSkillAgent } from './dev-host-skill-agent'

async function main() {
  const calls: any[] = []
  const client = { chat: { completions: { create: async (request: any) => {
    calls.push(structuredClone(request))
    if (calls.length === 1) return { choices: [{ message: { role: 'assistant', content: null,
      tool_calls: [{ id: 'tool-1', type: 'function', function: { name: 'run_skill', arguments: JSON.stringify({ argv: ['snapshot', '--json'] }) } }] } }] }
    return { choices: [{ message: { role: 'assistant', content: 'Collector is ready.' } }] }
  } } } } as any
  let invoked = 0
  const invoke = async (argv: string[]) => {
    invoked++
    assert.deepEqual(argv, ['snapshot', '--json'])
    return { apiVersion: 'clawmax.host-agent-skill/v1alpha1' as const, kind: 'AgentSkillExecutionResult' as const,
      requestId: 'a'.repeat(64), status: 'completed' as const, resultDigest: `sha256:${'b'.repeat(64)}`,
      output: { apiVersion: 'maximilien.ai/v1alpha1', kind: 'OperationsSnapshot', resources: [] } }
  }
  assert.equal(await runDevHostSkillAgent({ message: 'status?', skillName: 'maximilien', skillInstructions: '# Skill', apiKey: 'test-key', client, invoke }), 'Collector is ready.')
  assert.equal(invoked, 1)
  assert.equal(calls[1].messages.at(-1).role, 'tool')
  assert(!JSON.stringify(calls).includes('test-key'))
  assert(!JSON.stringify(calls).includes('MAXIMILIEN_ACCESS_TOKEN'))
  const aborted = new AbortController(); aborted.abort()
  await assert.rejects(runDevHostSkillAgent({ message: 'status?', skillName: 'maximilien', skillInstructions: '# Skill', apiKey: 'test-key', client, invoke, signal: aborted.signal }), /cancelled/)
  assert.equal(invoked, 1)
  const invalid = { chat: { completions: { create: async () => ({ choices: [{ message: { role: 'assistant', tool_calls: [{ id: 'tool-2', type: 'function', function: { name: 'run_skill', arguments: '{"argv":["snapshot"]}' } }] } }] }) } } } as any
  await assert.rejects(runDevHostSkillAgent({ message: 'status?', skillName: 'maximilien', skillInstructions: '# Skill', apiKey: 'test-key', client: invalid, invoke }), /arguments invalid/)
  assert.equal(invoked, 1)
  console.log('dev-host-skill-agent.test.ts: passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
