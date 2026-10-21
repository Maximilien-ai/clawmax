import assert from 'node:assert/strict'
import { forwardChatMessage, loadForwardTargets } from './agentChatForward'

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    console.error(error)
    process.exitCode = 1
  }
}

type Reply = { status?: number; body: unknown } | Error
function fakeFetch(replies: Record<string, Reply>, calls: Array<{ url: string; init?: RequestInit }> = []) {
  return (async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    const reply = replies[url]
    if (!reply) throw new Error(`unexpected request ${url}`)
    if (reply instanceof Error) throw reply
    const status = reply.status ?? 200
    return { ok: status >= 200 && status < 300, status, json: async () => reply.body } as Response
  }) as typeof fetch
}

async function run() {
  await test('lists groups then communities, skipping malformed entries', async () => {
    const targets = await loadForwardTargets(fakeFetch({
      '/api/groups': { body: { groups: [{ name: 'eng', displayName: 'Engineering' }, { displayName: 'no name' }] } },
      '/api/communities': { body: { communities: [{ name: 'all-hands' }] } },
    }))
    assert.deepEqual(targets, [
      { type: 'group', name: 'eng', displayName: 'Engineering' },
      { type: 'community', name: 'all-hands' },
    ])
  })

  await test('an empty workspace resolves to an empty list instead of loading forever', async () => {
    const targets = await loadForwardTargets(fakeFetch({
      '/api/groups': { body: { groups: [] } },
      '/api/communities': { body: { communities: [] } },
    }))
    assert.deepEqual(targets, [])
  })

  await test('a failed list request rejects with the server reason', async () => {
    await assert.rejects(loadForwardTargets(fakeFetch({
      '/api/groups': { status: 500, body: { error: 'ENOENT: GROUPS.md' } },
      '/api/communities': { body: { communities: [] } },
    })), /Could not load groups: ENOENT: GROUPS\.md/)
    await assert.rejects(loadForwardTargets(fakeFetch({
      '/api/groups': { body: { groups: [] } },
      '/api/communities': new TypeError('Failed to fetch'),
    })), /Failed to fetch/)
  })

  await test('forwarding posts to the target and reports a rejected send', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    await forwardChatMessage({ type: 'community', name: 'all hands' }, { content: 'hello', from: 'writer' }, fakeFetch({
      '/api/communities/all%20hands/messages': { body: { ok: true } },
    }, calls))
    assert.equal(calls[0].init?.method, 'POST')
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { content: 'hello', from: 'writer', mentions: [] })
    await assert.rejects(forwardChatMessage({ type: 'group', name: 'eng' }, { content: 'x', from: 'user' }, fakeFetch({
      '/api/groups/eng/messages': { status: 400, body: { ok: false, error: 'content is required' } },
    })), /content is required/)
  })
}

void run()
