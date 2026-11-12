import assert from 'assert'
import { loadWorkflowAgents } from './workflowAgents'
async function run() {
  const original = global.fetch
  try {
    const urls: string[] = []
    global.fetch = (async (url: any) => {
      urls.push(String(url))
      return { ok: true, json: async () => urls.length === 1 ? { agents: [{ id: 'one' }, { id: 'archived', archived: true }], hasMore: true, nextCursor: 'one' } : { agents: [{ id: 'two' }], hasMore: false } } as any
    }) as any
    assert.deepEqual((await loadWorkflowAgents()).map(a => a.id), ['one', 'two'])
    assert(urls[1].includes('cursor=one'))
    global.fetch = (async () => ({ ok: false })) as any
    await assert.rejects(loadWorkflowAgents(), /Could not load/)
    global.fetch = (async () => ({ ok: true, json: async () => ({ agents: [], hasMore: true, nextCursor: 'repeat' }) })) as any
    await assert.rejects(loadWorkflowAgents(), /incomplete/)
    console.log('Workflow agent pagination, archived exclusion and failure tests passed')
  } finally { global.fetch = original }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
