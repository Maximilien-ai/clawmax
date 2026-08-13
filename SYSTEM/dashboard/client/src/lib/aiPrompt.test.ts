import assert from 'assert'
import { expandPromptWithAI } from './aiPrompt'

const originalFetch = globalThis.fetch
const requests: any[] = []
globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
  requests.push(JSON.parse(String(init?.body || '{}')))
  return new Response(JSON.stringify({ ok: true, expandedPrompt: 'Expanded prompt' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}) as typeof fetch

async function run() {
  for (const target of ['agent', 'workflow', 'skill', 'template'] as const) {
    const result = await expandPromptWithAI(`Draft a ${target}`, target, 'markdown', 'Be concrete')
    assert.equal(result, 'Expanded prompt')
  }
  assert.equal(requests.length, 4)
  assert.deepEqual(requests.map((request) => request.target), ['agent', 'workflow', 'skill', 'template'])
  assert(requests.every((request) => request.format === 'markdown' && request.guidance === 'Be concrete'))
  console.log('aiPrompt.test.ts: 4 targets passed')
}

run().finally(() => { globalThis.fetch = originalFetch })
